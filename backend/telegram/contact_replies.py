from contextlib import suppress
from secrets import token_urlsafe

from aiogram import Bot
from aiogram.enums import ChatType
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest
from aiogram.types import (
    CallbackQuery,
    ForceReply,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    ReplyParameters,
    Update,
)
from loguru import logger

from backend.redis_db import RedisWorker, async_redis
from settings import settings


REPLY_PREFIX = "contact_reply:"
reply_store = RedisWorker(async_redis)


async def contact_reply_button(source: Message, group_id: int) -> InlineKeyboardButton:
    key = REPLY_PREFIX + token_urlsafe(12)
    await reply_store.save_data(key, {
        "group_id": group_id,
        "author_id": source.chat.id,
        "source_id": source.message_id,
    })
    return InlineKeyboardButton(text="Ответить с обращением", callback_data=key)


def is_contact_group(message: Message | None) -> bool:
    if not isinstance(message, Message) or message.chat.type not in (ChatType.GROUP, ChatType.SUPERGROUP):
        return False
    if settings.CONTACT_DESTINATIONS:
        return any(route.chat_id == message.chat.id for route in settings.CONTACT_DESTINATIONS.values())
    return message.chat.id == settings.SUPPORT_CHAT_ID


async def handle_contact_replies(handler, event: Update, data):
    bot: Bot = data["bot"]
    callback = event.callback_query
    if callback and callback.data and callback.data.startswith(REPLY_PREFIX):
        await open_contact_reply(bot, callback)
        return

    message = event.message
    if (
        is_contact_group(message)
        and message.reply_to_message
        and message.reply_to_message.from_user
        and message.reply_to_message.from_user.id == bot.id
        and message.from_user
        and not message.from_user.is_bot
    ):
        key = f"contact_draft:{message.chat.id}:{message.reply_to_message.message_id}"
        if await reply_store.get_data(key):
            await deliver_contact_reply(bot, message, key)
            return

    return await handler(event, data)


async def open_contact_reply(bot: Bot, callback: CallbackQuery) -> None:
    notice = callback.message
    if not is_contact_group(notice) or not notice.from_user or notice.from_user.id != bot.id:
        await callback.answer("Открой обращение в группе команды.", show_alert=True)
        return

    request = await reply_store.get_data(callback.data)
    if not request or request["group_id"] != notice.chat.id:
        await callback.answer("Обращение недоступно.", show_alert=True)
        return

    manager_id = callback.from_user.id
    await callback.answer()
    prompt = await notice.answer(
        f'<a href="tg://user?id={manager_id}">Напиши ответ</a> на это сообщение. '
        "Пользователь получит его в чате с ботом вместе со своим обращением.",
        reply_markup=ForceReply(selective=True, input_field_placeholder="Ответ пользователю"),
        reply_parameters=ReplyParameters(message_id=notice.message_id),
    )
    await reply_store.save_data(f"contact_draft:{notice.chat.id}:{prompt.message_id}", {
        "manager_id": manager_id,
        "author_id": request["author_id"],
        "source_id": request["source_id"],
    })


async def deliver_contact_reply(bot: Bot, message: Message, key: str) -> None:
    async with async_redis.lock(f"{key}:lock", timeout=120):
        draft = await reply_store.get_data(key)
        if not draft or draft["manager_id"] != message.from_user.id:
            return
        if message.media_group_id:
            await message.reply("Отправь ответ текстом или одним файлом.")
            return

        try:
            if "copied_source_id" not in draft:
                source = await bot.copy_message(
                    chat_id=draft["author_id"],
                    from_chat_id=draft["author_id"],
                    message_id=draft["source_id"],
                )
                draft["copied_source_id"] = source.message_id
                await reply_store.save_data(key, draft)

            await bot.copy_message(
                chat_id=draft["author_id"],
                from_chat_id=message.chat.id,
                message_id=message.message_id,
                reply_parameters=ReplyParameters(
                    message_id=draft["copied_source_id"], allow_sending_without_reply=True,
                ),
            )
        except TelegramAPIError as exc:
            logger.warning("Не удалось доставить ответ на обращение: {}", type(exc).__name__)
            error = (
                "Не удалось доставить ответ вместе с обращением. "
                "Попробуй ещё раз, ответив на сообщение бота, или напиши автору напрямую."
            )
            if (
                "copied_source_id" not in draft
                and isinstance(exc, TelegramBadRequest)
                and "message to copy not found" in exc.message.lower()
            ):
                error = "Исходное сообщение недоступно в чате с ботом. Можно написать автору напрямую."
            await message.reply(error)
            return

        await async_redis.delete(key)

    with suppress(TelegramAPIError):
        await bot.edit_message_text(
            chat_id=message.chat.id,
            message_id=message.reply_to_message.message_id,
            text="Ответ и обращение доставлены пользователю.",
        )
