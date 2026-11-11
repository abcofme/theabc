from asyncio import Lock
from contextlib import suppress
from datetime import datetime
import html
from pathlib import Path, PurePath

from aiogram import F
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest
from aiogram.filters import CommandObject, CommandStart, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.methods import EditMessageCaption, SendPhoto, SendVideo
from aiogram.types import Message, CallbackQuery, FSInputFile, InlineKeyboardButton, InlineKeyboardMarkup, InputMediaVideo
from aiogram.utils.i18n import gettext
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.types.web_app_info import WebAppInfo
from loguru import logger

from backend.database.models import User
from backend.database.patterns.dao import DataAccessObject
from backend.friends import befriend, inviter_from_payload
from backend.telegram.notify import greet_new_friend
from backend.telegram.bot import dp, bot
from backend.telegram.callback_data.profile import (
    AboutDiary, AboutProject, AboutTests, ContactTopic, ContactTopicChoice, MainMenu, Psychologist, TechSupport,
    TestCategoryDesc,
)
from backend.referrals import capture_referral
from backend.telegram.keyboards.base import back_kb
from backend.telegram.keyboards.start import (
    about_diary_kb, categories_kb, contact_back_kb, contact_topics_kb, menu_kb, start_kb,
)
from backend.telegram.states.user import TechStates
from backend.telegram.utils.message import (
    schedule_message_edition,
    delete_pending_messages,
    delete_editing_message,
    schedule_previous_message
)
from paths import IMAGES
from settings import settings


WELCOME_VIDEO = Path(IMAGES.parent / "videos" / "welcome.mp4")
DETAILS_VIDEO = WELCOME_VIDEO.with_name("details.mp4")
_details_upload_lock = Lock()
_details_video_file_id: str | None = None


START_TEXT = "<b>Что такое азбука Я.</b>"


CONTACT_PROMPTS = {
    ContactTopic.SUPPORT: "Опиши, что не работает или какой вопрос возник. Можно отправить скриншот с подписью.",
    ContactTopic.PARTNERSHIP: "Расскажи о себе или своей организации и предложи, как мы можем сотрудничать.",
}
contact_isolation = dp.storage.create_isolation()


async def send_section_card(user: User, image: PurePath, caption: str, keyboard: InlineKeyboardMarkup) -> Message:
    msg = await bot(SendPhoto(
        chat_id=user.id,
        photo=FSInputFile(image),
        caption=caption,
        show_caption_above_media=True,
        reply_markup=keyboard,
    ))
    await schedule_message_edition(user, msg)
    return msg


async def send_welcome(user: User) -> None:
    keyboard = start_kb(user, has_details_video=DETAILS_VIDEO.is_file())
    if not WELCOME_VIDEO.is_file():
        await send_section_card(user, IMAGES / "приветствие.jpg", START_TEXT, keyboard)
        return

    msg = await bot(SendVideo(
        chat_id=user.id,
        video=FSInputFile(WELCOME_VIDEO),
        width=1080,
        height=1920,
        duration=26,
        caption=START_TEXT,
        show_caption_above_media=True,
        reply_markup=keyboard,
        supports_streaming=True,
    ))
    await schedule_message_edition(user, msg)


@dp.message(CommandStart())
async def start_handler(
        message: Message, command: CommandObject, user: User, state: FSMContext, dao: DataAccessObject
):
    payload = command.args
    if payload and not user.has_opened_app:
        async with dao.session.begin():
            await dao.session.refresh(user, with_for_update={"key_share": True})
            await capture_referral(dao.session, user, payload, now=datetime.utcnow())

    # Личная ссылка-приглашение друга: дружба сразу принята, пригласившему — сообщение
    inviter_id = inviter_from_payload(payload)
    if inviter_id and await befriend(dao.session, user.id, inviter_id):
        await greet_new_friend(user, inviter_id)

    await delete_pending_messages(user)
    await delete_editing_message(user)
    await state.clear()

    await send_welcome(user)


@dp.callback_query(MainMenu.filter())
async def start_callback(
        callback: CallbackQuery, user: User, state: FSMContext
):
    await callback.answer()
    await callback.message.delete()
    await delete_pending_messages(user)
    await delete_editing_message(user)
    await state.clear()

    await send_welcome(user)


async def edit_details_video(message: Message, video: str | FSInputFile) -> Message | bool:
    return await bot(message.edit_media(
        media=InputMediaVideo(
            media=video,
            width=1072,
            height=1920,
            duration=139,
            caption="<b>Как это выглядит изнутри</b>",
            show_caption_above_media=True,
            supports_streaming=True,
        ),
        reply_markup=menu_kb(),
    ), request_timeout=120)


@dp.callback_query(AboutProject.filter())
async def about_project_callback(callback: CallbackQuery):
    global _details_video_file_id

    if not isinstance(callback.message, Message) or not DETAILS_VIDEO.is_file():
        await callback.answer("Видео пока недоступно.", show_alert=True)
        return

    await callback.answer("Открываю видео…" if _details_video_file_id is None else None)
    try:
        if _details_video_file_id is not None:
            await edit_details_video(callback.message, _details_video_file_id)
            return

        async with _details_upload_lock:
            msg = await edit_details_video(
                callback.message, _details_video_file_id or FSInputFile(DETAILS_VIDEO)
            )
            if isinstance(msg, Message) and msg.video:
                _details_video_file_id = msg.video.file_id
    except TelegramBadRequest as exc:
        if "message is not modified" not in exc.message:
            raise


@dp.callback_query(AboutDiary.filter())
async def AboutDiary_callback(callback: CallbackQuery, user: User, state: FSMContext):
    await callback.message.delete()
    await delete_pending_messages(user)
    await delete_editing_message(user)
    
    text = (
        "<b>О дневнике:</b>\n"
        "- это твой <b>личный говорящий дневник</b>, соблюдающий 152-ФЗ, "
        "поэтому никто кроме тебя не видит записи.\n\n"
        "<b><u>Как это работает:</u></b>\n"
        "Он отлично тебя понимает, так как раскладывает на событие и реакцию на слои, "
        "потом прогоняет через оси, состоящие из результатов тестов.\n\n"
        "Он дает хорошие советы, так как берет их из классических правил и авторитетов "
        "<tg-spoiler>психодиагностики, психологии личности, поведенческой активации, "
        "теории мотивации и психологии действия</tg-spoiler>.\n\n"
        "<blockquote>Вообще, работа дневника гораздо сложнее, но лучше пользоваться "
        "и видеть качество на практике, чем понимать все.</blockquote>\n\n"
        "<i>Желаем приятного и полезного использования!</i>"
    )
    await send_section_card(user, IMAGES / "о_дневнике.jpg", text, about_diary_kb())

@dp.callback_query(AboutTests.filter())
async def AboutTests_callback(callback: CallbackQuery, user: User, state: FSMContext):
    await callback.answer()
    await callback.message.delete()
    await delete_pending_messages(user)
    await delete_editing_message(user)
    
    text = (
        "<b>О тестах:</b>\n"
        "- мы собрали классику психодиагностики, описывающую всю личность, "
        "кроме живого опыта, который вы описываете в дневнике, и можете увидеть реальное "
        "<b>пересечение опыта и предрасположенности</b> в отчетах."
    )
    await send_section_card(user, IMAGES / "о_тестах.jpg", text, categories_kb())

@dp.callback_query(TestCategoryDesc.filter())
async def TestCategoryDesc_callback(callback: CallbackQuery, callback_data: TestCategoryDesc, user: User, state: FSMContext):
    await callback.answer()
    await callback.message.delete()
    await delete_pending_messages(user)
    await delete_editing_message(user)
    
    descriptions = {
        "Личность": (
            "<b>Личность</b>\n\n"
            "<blockquote>Какие привычки и сценарии повторяются в твоей жизни? "
            "Что для тебя по-настоящему важно?</blockquote>\n\n"
            "<u>Что покажут тесты</u>\n"
            "Какие <b>сильные стороны</b> помогают тебе и с какими особенностями стоит научиться работать."
        ),
        "Самооценка": (
            "<b>Самооценка</b>\n\n"
            "<blockquote>Как ты воспринимаешь себя? Что замечают окружающие?</blockquote>\n\n"
            "<u>Что покажут тесты</u>\n"
            "Какие ожидания давят на тебя и на какие <b>собственные принципы</b> ты можешь опереться."
        ),
        "Темперамент": (
            "<b>Темперамент</b>\n\n"
            "Темперамент — <b>фундамент твоей психики</b>. Тест выявляет врождённые свойства, "
            "которые не меняются и остаются с тобой навсегда.\n\n"
            "<u>Что покажут тесты</u>\n"
            "<blockquote>Почему ты по-разному реагируешь в стрессе и в радости "
            "и как учитывать свой темперамент в обычной жизни.</blockquote>"
        ),
        "Общительность": (
            "<b>Общительность</b>\n\n"
            "<blockquote>Вспомни недавний разговор. В какой момент тебе стало интересно включиться?</blockquote>\n\n"
            "<u>Что покажут тесты</u>\n"
            "В каком <b>стиле общения</b> тебе комфортно и в каких разговорах ты охотнее проявляешь инициативу."
        ),
        "Профориентация": (
            "<b>Профориентация</b>\n\n"
            "<blockquote>Какие задачи дают тебе энергию, а какие выматывают?</blockquote>\n\n"
            "<u>Что покажут тесты</u>\n"
            "К каким видам работы тебя тянет и во что хочется вкладываться.\n\n"
            "<u>Какие отчёты дополнят результат</u>\n"
            "<blockquote expandable><b>«Энергия»</b> покажет, какие задачи дают силы и какие их забирают.\n"
            "<b>«Чувство компетентности»</b> поможет понять, какую ответственность ты можешь взять на себя.\n"
            "Сопоставь их с записями в дневнике, чтобы увидеть, как это проявляется в твоей работе.</blockquote>"
        ),
    }
    
    text = descriptions.get(callback_data.name, "Описание не найдено.")
    
    builder = InlineKeyboardBuilder()
    builder.button(
        text="Открыть тесты",
        web_app=WebAppInfo(url=settings.WEB_APP_URL + "?tab=tests")
    )
    builder.button(text="← Назад", callback_data=AboutTests().pack())
    builder.adjust(1)
    
    image_path = Path(IMAGES) / f"{callback_data.name.lower()}.png"
    if not image_path.exists():
        image_path = image_path.with_suffix(".jpg")

    await send_section_card(user, image_path, text, builder.as_markup())

@dp.callback_query(Psychologist.filter())
async def Psychologist_callback(
        callback: CallbackQuery, user: User, state: FSMContext
):
    await bot.send_message(
        chat_id=settings.REQUESTS_CHAT_ID,
        text=gettext("messages.psychologist.request_success.for_chat").format(
            user_id=user.id,
            username=f"@{user.username}" if user.username else "нет",
            name=html.escape(user.tg_first_name or "нет")
        )
    )
    await callback.answer(
        show_alert=True,
        text=gettext("messages.psychologist.request_success.for_user")
    )


@dp.callback_query(TechSupport.filter())
async def TechSupport_callback(
        callback: CallbackQuery, user: User, state: FSMContext
):
    await callback.answer()
    async with contact_isolation.lock(state.key):
        await delete_pending_messages(user)
        await delete_editing_message(user)
        if callback.message:
            with suppress(TelegramAPIError):
                await bot.delete_message(chat_id=callback.message.chat.id, message_id=callback.message.message_id)
        await state.clear()

        text = (
            "<b>Связь</b>\n\n"
            "Выбери тему или напиши сообщение прямо в этот чат. "
            "Можно отправить скриншот с подписью."
        )
        card = await send_section_card(user, IMAGES / "связь.jpg", text, contact_topics_kb())
        await state.set_data({"contact_card_id": card.message_id})
        await state.set_state(TechStates.message)


async def edit_contact_card(chat_id: int, message_id: int, text: str, keyboard: InlineKeyboardMarkup) -> None:
    await bot(EditMessageCaption(
        chat_id=chat_id,
        message_id=message_id,
        caption=text,
        show_caption_above_media=True,
        reply_markup=keyboard,
    ))


@dp.callback_query(ContactTopicChoice.filter())
async def contact_topic_callback(
        callback: CallbackQuery, callback_data: ContactTopicChoice, state: FSMContext
):
    async with contact_isolation.lock(state.key):
        data = await state.get_data()
        if not isinstance(callback.message, Message) or data.get("contact_card_id") != callback.message.message_id:
            await callback.answer("Открой раздел «Связь» ещё раз.")
            return
        await callback.answer()
        topic = callback_data.topic
        await edit_contact_card(
            callback.message.chat.id, callback.message.message_id,
            f"<b>{topic.value}</b>\n\n{CONTACT_PROMPTS[topic]}", contact_back_kb("← К темам"),
        )
        await state.update_data(contact_topic=topic.value)


@dp.callback_query(F.data.startswith("contact_topic:"))
async def reopen_contact_topics(callback: CallbackQuery, user: User, state: FSMContext):
    await TechSupport_callback(callback, user, state)


@dp.message(StateFilter(TechStates.message))
async def TechStatesMessage_handler(
        message: Message, user: User, state: FSMContext
):
    async with contact_isolation.lock(state.key):
        if await state.get_state() == TechStates.message.state:
            await send_contact_request(message, user, state)


async def send_contact_request(message: Message, user: User, state: FSMContext) -> None:
    if message.media_group_id or not (message.text or message.caption or message.photo or message.document):
        await message.answer("Отправь текст, один скриншот или один файл отдельным сообщением.")
        return

    data = await state.get_data()
    topic = data.get("contact_topic", ContactTopic.SUPPORT.value)
    if topic == "Поддержка":
        topic = ContactTopic.SUPPORT.value
    username = f"@{user.username}" if user.username else "нет"
    notice = gettext("messages.tech_support.request_success.for_chat").format(
        user_id=user.id,
        username=html.escape(username),
        name=html.escape(user.tg_first_name or "нет"),
        topic=topic,
        request=html.escape(message.text or ""),
    )

    try:
        # Копирование сохраняет вложение, подпись и длинный текст целиком.
        if message.text and len(notice.encode("utf-16-le")) <= 2 * 4096:
            await bot.send_message(chat_id=settings.SUPPORT_CHAT_ID, text=notice)
        else:
            author = username if user.username else "Автор"
            profile_url = f"https://t.me/{user.username}" if user.username else f"tg://user?id={user.id}"
            await bot.copy_message(
                chat_id=settings.SUPPORT_CHAT_ID,
                from_chat_id=message.chat.id,
                message_id=message.message_id,
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                    InlineKeyboardButton(text=f"{topic} · {author} ({user.id})", url=profile_url),
                ]]),
            )
    except TelegramAPIError as exc:
        if isinstance(exc, TelegramBadRequest) and "chat not found" in exc.message.lower():
            logger.warning("Чат для обращений недоступен: Telegram не нашёл SUPPORT_CHAT_ID")
            await message.answer("Чат команды временно недоступен. Напиши нам на info@abcofme.ru.")
        else:
            logger.warning("Не удалось отправить обращение: {}", type(exc).__name__)
            await message.answer("Не удалось отправить обращение. Попробуй ещё раз или напиши нам на info@abcofme.ru.")
        return

    if await state.get_state() == TechStates.message.state:
        await state.clear()
    text = gettext("messages.tech_support.request_success.for_user")
    keyboard = contact_back_kb("Написать ещё")
    await confirm_contact_request(message, data.get("contact_card_id"), text, keyboard)
    with suppress(TelegramAPIError):
        await message.delete()


async def confirm_contact_request(
        message: Message, card_id: int | None, text: str, keyboard: InlineKeyboardMarkup
) -> None:
    if card_id is not None:
        try:
            await edit_contact_card(message.chat.id, card_id, text, keyboard)
            return
        except TelegramAPIError:
            pass
    await message.answer(text, reply_markup=keyboard)
