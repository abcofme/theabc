from datetime import datetime
import html
from pathlib import Path, PurePath

from aiogram.filters import CommandObject, CommandStart, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.methods import SendPhoto
from aiogram.types import Message, CallbackQuery, FSInputFile, InlineKeyboardMarkup
from aiogram.utils.i18n import gettext
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.types.web_app_info import WebAppInfo

from backend.database.models import User
from backend.database.patterns.dao import DataAccessObject
from backend.friends import befriend, inviter_from_payload
from backend.telegram.notify import greet_new_friend
from backend.telegram.bot import dp, bot
from backend.telegram.callback_data.profile import Psychologist, TechSupport, MainMenu, AboutDiary, AboutTests, TestCategoryDesc
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


START_TEXT = (
    "<b><u>Азбука Я</u></b>\n"
    "<i>Что стоит за твоими реакциями и что тебе нужно?</i>\n\n"
    "<blockquote><b>Дневник</b> — замечай, как реагируешь на события.\n"
    "<b>Тесты</b> — узнавай свои особенности.\n"
    "<b>Отчёты</b> — смотри, что повторяется и куда уходит энергия.</blockquote>\n\n"
    "Начни с <b>личного дневника</b> или выбери раздел ниже."
)


async def send_section_card(user: User, image: PurePath, caption: str, keyboard: InlineKeyboardMarkup) -> None:
    msg = await bot(SendPhoto(
        chat_id=user.id,
        photo=FSInputFile(image),
        caption=caption,
        show_caption_above_media=True,
        reply_markup=keyboard,
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

    await send_section_card(user, IMAGES / "приветствие.jpg", START_TEXT, start_kb(user))


@dp.callback_query(MainMenu.filter())
async def start_callback(
        callback: CallbackQuery, user: User, state: FSMContext
):
    await callback.answer()
    await callback.message.delete()
    await delete_pending_messages(user)
    await delete_editing_message(user)
    await state.clear()

    await send_section_card(user, IMAGES / "приветствие.jpg", START_TEXT, start_kb(user))

@dp.callback_query(AboutDiary.filter())
async def AboutDiary_callback(callback: CallbackQuery, user: User, state: FSMContext):
    await callback.message.delete()
    await delete_pending_messages(user)
    await delete_editing_message(user)
    
    text = (
        "<b>Личный дневник</b>\n"
        "<i>Одна запись — одно событие и твоя реакция.</i>\n\n"
        "<u>Как он работает</u>\n"
        "<blockquote>1. <b>Записываешь</b> событие и свою реакцию.\n"
        "2. <b>Получаешь подсказку</b> с опорой на результаты тестов.\n"
        "3. <b>Смотришь отчёты</b> о том, что повторяется в записях.</blockquote>\n\n"
        "<u>Пример записи</u> · <i>нажми, чтобы открыть</i>\n"
        "<tg-spoiler><b>Событие</b> — встречу перенесли в последний момент.\n"
        "<b>Реакция</b> — меня это разозлило, потому что весь день был распланирован.</tg-spoiler>\n\n"
        "<i>Чем чаще пишешь, тем точнее отчёты.</i>"
    )
    await send_section_card(user, IMAGES / "о_дневнике.jpg", text, about_diary_kb())

@dp.callback_query(AboutTests.filter())
async def AboutTests_callback(callback: CallbackQuery, user: User, state: FSMContext):
    await callback.answer()
    await callback.message.delete()
    await delete_pending_messages(user)
    await delete_editing_message(user)
    
    text = (
        "<b>Психологические тесты</b>\n"
        "<i>Выбери тему, о которой хочешь узнать больше.</i>\n\n"
        "<u>Что дадут результаты</u>\n"
        "<blockquote><b>Портрет личности</b> соберёт твои особенности, сильные стороны и зоны роста.\n"
        "<b>Дневник</b> поможет увидеть, как эти особенности проявляются в жизни.</blockquote>\n\n"
        "<u>Как проходить тесты</u>\n"
        "<blockquote expandable>Начни, когда есть время и ничто не отвлекает.\n"
        "Вспомни, как обычно ведёшь себя в такой ситуации.\n"
        "Отметь вариант, который первым кажется точным.\n"
        "Если подходят два ответа, выбери тот, который лучше описывает твой обычный день.</blockquote>"
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
        "<b>Связь</b>\n"
        "<i>Напиши сообщение прямо в этот чат.</i>\n\n"
        "<u>С чем можно обратиться</u>\n"
        "<blockquote><b>Поддержка</b> — что-то не работает или есть предложение.\n"
        "<b>Психолог</b> — нужно подобрать специалиста.\n"
        "<b>Обучение</b> — ищешь программу по интересующему направлению.</blockquote>"
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
