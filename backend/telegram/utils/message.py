import contextlib
import typing

from aiogram import types
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest
from aiogram.fsm.context import FSMContext
from aiogram.types import InputMediaDocument, InputMediaPhoto, InputMediaAudio, InputMediaVideo

from backend.database.models import User
from backend.redis_db.context import context_manager, DELETE_KEY, EDIT_KEY, PREVIOUS_KEY
from backend.telegram.bot import bot

Message: typing.TypeAlias = types.Message | types.MessageId


class MessageManager:
    def __init__(self, user: User, key: str = DELETE_KEY):
        self.user = user
        self.mode = key

    async def __aenter__(self):
        self.context, section = await context_manager.get_section(self.user.id, self.mode)
        return section

    async def __aexit__(self, *args, **kwargs):
        await context_manager.update(self.user.id, self.context)


def message_to_ids(user: User, message: Message) -> list[int]:
    return [
        message.chat.id if isinstance(message, types.Message) else user.id,
        message.message_id,
    ]


async def delete_pending_messages(user: User):
    async with MessageManager(user) as trash:
        for chat_id, message_id in trash:
            with contextlib.suppress(TelegramAPIError):
                await bot.delete_message(chat_id=chat_id, message_id=message_id)
        trash.clear()


async def schedule_messages_deletion(user: User, *messages: Message):
    async with MessageManager(user) as trash:
        trash.extend([message_to_ids(user, message) for message in messages])


async def schedule_message_deletion(user: User, message: Message):
    async with MessageManager(user) as trash:
        trash.append(message_to_ids(user, message))


async def schedule_message_edition(user: User, message: Message):
    async with MessageManager(user, EDIT_KEY) as edit:
        edit.clear()
        edit.append(message_to_ids(user, message))


async def schedule_messages_edition(user: User, messages: list[Message]):
    async with MessageManager(user, EDIT_KEY) as edit:
        edit.clear()
        edit.extend([message_to_ids(user, message) for message in messages])


async def edit_scheduled_message(
        user: User, text: str = None,
        kb: typing.Union[
            types.InlineKeyboardMarkup,
            types.ReplyKeyboardRemove,
            types.ReplyKeyboardMarkup
        ] = None,
        media_group: list[InputMediaAudio | InputMediaDocument | InputMediaPhoto | InputMediaVideo] | bool = None,
) -> types.Message:
    async with MessageManager(user, EDIT_KEY) as edit:
        edit: list[int, int]
        for _index, (chat_id, message_id) in enumerate(edit):
            msg = None
            with contextlib.suppress(TelegramBadRequest):
                if media_group:
                    if isinstance(media_group, list):
                        if _index != len(edit) - 1:
                            await bot.delete_message(chat_id=chat_id, message_id=message_id)
                            continue
                        media, = media_group
                        if text and hasattr(media, 'caption'):
                            media.caption = text
                        try:
                            msg = await bot.edit_message_media(
                                chat_id=chat_id, message_id=message_id, media=media, reply_markup=kb
                            )
                        except Exception as e:
                            await bot.send_message(chat_id=chat_id, text=f"🔧 Техническая ошибка при загрузке картинки: {e}")
                elif text:
                    try:
                        msg = await bot.edit_message_text(
                            chat_id=chat_id, message_id=message_id, text=text, reply_markup=kb
                        )
                    except:
                        msg = await bot.edit_message_caption(
                            chat_id=chat_id, message_id=message_id, caption=text, reply_markup=kb
                        )
                else:
                    msg = await bot.edit_message_reply_markup(
                        chat_id=chat_id, message_id=message_id, reply_markup=kb
                    )
                return msg


async def delete_editing_message(user: User):
    async with MessageManager(user, EDIT_KEY) as edit:
        for chat_id, message_id in edit:
            with contextlib.suppress(TelegramAPIError):
                await bot.delete_message(chat_id=chat_id, message_id=message_id)
        edit.clear()


async def schedule_previous_message(
        user: User, message: Message, state: FSMContext, on_state: bool = False
):
    async with MessageManager(user, PREVIOUS_KEY) as previous:
        key_state = await state.get_state()
        previous.append((message.json(exclude_none=True), on_state, key_state))


async def delete_previous_message(user: User, delete: bool = True):
    async with MessageManager(user, PREVIOUS_KEY) as messages:
        messages: list[tuple[str, bool, str]]
        for msg in messages[::-1]:
            messages.pop(-1)
            if msg[-1]:
                if delete:
                    message: types.Message = types.Message.model_validate_json(str(msg[0]))
                    with contextlib.suppress(TelegramAPIError):
                        await bot.delete_message(chat_id=message.chat.id, message_id=message.message_id)
                return


async def clear_previous_messages(user: User):
    async with MessageManager(user, PREVIOUS_KEY) as messages:
        messages.clear()


async def delete_previous_messages(user: User):
    async with MessageManager(user, PREVIOUS_KEY) as messages:
        messages: list[tuple[str, bool, str]]
        for msg in messages:
            message: types.Message = types.Message.model_validate_json(str(msg[0]))
            with contextlib.suppress(TelegramAPIError):
                await bot.delete_message(chat_id=message.chat.id, message_id=message.message_id)
        messages.clear()


async def back_to_previous_message(user: User, state: FSMContext, delete: bool = False):
    async with MessageManager(user, PREVIOUS_KEY) as messages:
        messages: list[tuple[str, bool, str]]
        flag_check = True
        for msg in messages[::-1]:
            if flag_check:
                messages.pop(-1)
            if msg[1] and flag_check:
                flag_check = False
                continue
            message: types.Message = types.Message.model_validate_json(str(msg[0]))

            text = message.text or message.caption

            await state.set_state(msg[-1])
            if delete:
                if not message.photo:
                    return await bot.send_message(chat_id=user.id, text=text, reply_markup=message.reply_markup)
                else:
                    return await bot.send_photo(
                        chat_id=user.id, caption=text, reply_markup=message.reply_markup,
                        photo=message.photo[0].file_id
                    )
            if not message.photo:
                return await edit_scheduled_message(user, text, kb=message.reply_markup)
            else:
                return await edit_scheduled_message(
                    user, text, kb=message.reply_markup,
                    media_group=[InputMediaPhoto(media=message.photo[0].file_id)]
                )


# Useless
async def reschedule_message_deletion(user: User, message: Message, *, old_message: Message):
    async with MessageManager(user) as trash:
        index = trash.index(message_to_ids(user, old_message))
        trash[index] = message_to_ids(user, message)


# Useless
async def is_scheduled_to_deletion(user: User, message: Message) -> bool:
    async with MessageManager(user) as trash:
        return message_to_ids(user, message) in trash
