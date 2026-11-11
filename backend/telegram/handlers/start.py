from asyncio import Lock
from datetime import datetime
import html
from pathlib import Path, PurePath

from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import CommandObject, CommandStart, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.methods import SendPhoto, SendVideo
from aiogram.types import Message, CallbackQuery, FSInputFile, InlineKeyboardMarkup, InputMediaVideo
from aiogram.utils.i18n import gettext
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.types.web_app_info import WebAppInfo

from backend.database.models import User
from backend.database.patterns.dao import DataAccessObject
from backend.friends import befriend, inviter_from_payload
from backend.telegram.notify import greet_new_friend
from backend.telegram.bot import dp, bot
from backend.telegram.callback_data.profile import Psychologist, TechSupport, MainMenu, AboutDiary, AboutProject, AboutTests, TestCategoryDesc
from backend.referrals import capture_referral
from backend.telegram.keyboards.base import back_kb
from backend.telegram.keyboards.start import start_kb, main_menu_btn, menu_kb, categories_kb, about_diary_kb
from backend.telegram.states.user import TechStates
from backend.telegram.utils.message import (
    schedule_message_edition,
    delete_pending_messages,
    delete_editing_message, edit_scheduled_message,
    schedule_previous_message
)
from paths import IMAGES
from settings import settings


WELCOME_VIDEO = Path(IMAGES.parent / "videos" / "welcome.mp4")
DETAILS_VIDEO = WELCOME_VIDEO.with_name("details.mp4")
_details_upload_lock = Lock()
_details_video_file_id: str | None = None


START_TEXT = "<b>Что такое азбука Я.</b>"


async def send_section_card(user: User, image: PurePath, caption: str, keyboard: InlineKeyboardMarkup) -> None:
    msg = await bot(SendPhoto(
        chat_id=user.id,
        photo=FSInputFile(image),
        caption=caption,
        show_caption_above_media=True,
        reply_markup=keyboard,
    ))
    await schedule_message_edition(user, msg)


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
        "<b>О дневнике:</b> - это твой личный говорящий дневник, соблюдающий 152-ФЗ, "
        "поэтому никто кроме тебя не видит записи.\n\n"
        "<b>Как это работает:</b> Он отлично тебя понимает, так как раскладывает на событие "
        "и реакцию на слои, потом прогоняет через оси, состоящие из результатов тестов.\n\n"
        "Он дает хорошие советы, так как берет их из классических правил и авторитетов "
        "психодиагностики, психологии личности, поведенческой активации, теории мотивации "
        "и психологии действия.\n\n"
        "Вообще, работа дневника гораздо сложнее, но лучше пользоваться и видеть качество "
        "на практике, чем понимать все.\n\n"
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
        "<b>О тестах:</b> - мы собрали классику психодиагностики, описывающую всю личность, "
        "кроме живого опыта, который вы описываете в дневнике, и можете увидеть реальное "
        "пересечение опыта и предрасположенности в отчетах."
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
    await callback.message.delete()
    await delete_pending_messages(user)
    await delete_editing_message(user)
    
    await state.set_state(TechStates.message)
    text = (
        "<b>Связь</b> - Мы рады любой обратной связи, профессиональному общению, "
        "с радостью поможем подобрать обучение и психолога идеально подходящие именно под тебя."
    )
    await send_section_card(user, IMAGES / "связь.jpg", text, menu_kb())


@dp.message(StateFilter(TechStates.message))
async def TechStatesMessage_handler(
        message: Message, user: User, state: FSMContext
):
    await bot.send_message(
        chat_id=settings.SUPPORT_CHAT_ID,
        text=gettext("messages.tech_support.request_success.for_chat").format(
            user_id=user.id,
            username=f"@{user.username}" if user.username else "нет",
            name=html.escape(user.tg_first_name or "нет"),
            # Текст пользователя уходит в HTML-сообщение: «<» без экранирования ломает отправку
            request=html.escape(message.text or message.caption or "—")
        )
    )
    await message.delete()
    await state.clear()
    await edit_scheduled_message(
        user=user,
        text=gettext("messages.tech_support.request_success.for_user"),
        kb=menu_kb()
    )
