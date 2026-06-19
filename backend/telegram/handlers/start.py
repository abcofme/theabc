from aiogram.filters import CommandStart, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import Message, CallbackQuery, FSInputFile, InputMediaPhoto
from aiogram.utils.i18n import gettext
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.types import InlineKeyboardButton
from aiogram.types.web_app_info import WebAppInfo

from backend.database.models import User, TrackingLink
from sqlalchemy import select
from backend.database.patterns.dao import DataAccessObject
from backend.database.patterns.user import UserDAO
from backend.telegram.bot import dp, bot
from backend.telegram.callback_data.profile import Psychologist, TechSupport, MainMenu, Referal, AboutDiary, AboutTests, TestCategoryDesc
from backend.telegram.filters.invite import InvitedFilter
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


START_TEXT = "Вот что такое “Азбука Я”. Узнай свои настоящие потребности и увидь, как их реализовать"

@dp.message(CommandStart(), InvitedFilter())
async def start_handler(
        message: Message, user: User, state: FSMContext, dao: DataAccessObject
):
    if user.tracking_link_id is None and message.text and message.text.startswith("/start "):
        payload = message.text.split(" ")[-1]
        if payload.startswith("tr_"):
            code = payload[3:]
            link = await dao.session.scalar(select(TrackingLink).where(TrackingLink.code == code))
            if link:
                await dao.update_object(User, user.id, dict(tracking_link_id=link.id))

    await delete_pending_messages(user)
    await delete_editing_message(user)
    await state.clear()

    msg = await bot.send_photo(
        chat_id=user.id,
        photo=FSInputFile(IMAGES / f"приветствие.jpg"),
        caption=START_TEXT,
        reply_markup=start_kb(user)
    )
    await schedule_message_edition(user, msg)


@dp.callback_query(MainMenu.filter())
async def start_callback(
        callback: CallbackQuery, user: User, state: FSMContext
):
    await callback.answer()
    await callback.message.delete()
    await delete_pending_messages(user)
    await delete_editing_message(user)
    await state.clear()

    msg = await bot.send_photo(
        chat_id=user.id,
        photo=FSInputFile(IMAGES / f"приветствие.jpg"),
        caption=START_TEXT,
        reply_markup=start_kb(user)
    )
    await schedule_message_edition(user, msg)

@dp.callback_query(AboutDiary.filter())
async def AboutDiary_callback(callback: CallbackQuery, user: User, state: FSMContext):
    await callback.message.delete()
    await delete_pending_messages(user)
    await delete_editing_message(user)
    
    text = (
        "В век бесконечного потребления наш мозг не может запомнить все потребности, желания и неудовлетворения, ведь это уже далеко от выживания. Зато мы используем технологии, чтобы сделать жизнь лучше, например, дневник. На основе пройденных тестов он говорит, какая реакция на событие из жизни ближе всего к душе, помогает корректировать путь, создавая отчеты и тем самым стремиться к лучшему."
    )
    msg = await bot.send_photo(
        chat_id=user.id,
        photo=FSInputFile(IMAGES / "о_дневнике.jpg"),
        caption=text,
        reply_markup=about_diary_kb()
    )
    await schedule_message_edition(user, msg)

@dp.callback_query(AboutTests.filter())
async def AboutTests_callback(callback: CallbackQuery, user: User, state: FSMContext):
    await callback.answer()
    await callback.message.delete()
    await delete_pending_messages(user)
    await delete_editing_message(user)
    
    text = (
        "Мозгу свойственно переоценивать опыт. Поэтому ученые столетиями собирали и корректировали психодиагностические тесты, описывающие всю личность объективно, а мы объединили лучшие из них в удобном формате. Результаты всех этих тестов составляют полный психологический портрет из сильных, слабых сторон и особенностей, а дневник позволяет дополнить жизненным опытом и перенести эту теорию в новую практику. Проходи тесты в спокойном и расслабленном состоянии, выбирай ответ, который первый пришел в голову и правда кажется точнее."
    )
    msg = await bot.send_photo(
        chat_id=user.id,
        photo=FSInputFile(IMAGES / "о_тестах.jpg"),
        caption=text,
        reply_markup=categories_kb()
    )
    await schedule_message_edition(user, msg)

@dp.callback_query(TestCategoryDesc.filter())
async def TestCategoryDesc_callback(callback: CallbackQuery, callback_data: TestCategoryDesc, user: User, state: FSMContext):
    await callback.answer()
    await callback.message.delete()
    await delete_pending_messages(user)
    await delete_editing_message(user)
    
    descriptions = {
        "Личность": "Пути, которыми ты идешь по жизни формируют личность. Привычки, сценарии поведения, что для тебя действительно важно. Все это формирует твои сильные и слабые стороны. Их важно понимать и учиться с ними работать, чтобы жить лучшей жизнью, которой ты можешь.",
        "Самооценка": "Все люди ощущают самих себя по-разному. Как ощущаешь себя ты? И как это чувство транслируешь окружающим? Неудовлетворенность жизнью от завышенных ожиданий или полная свобода, чувство полета, наполненности от отсутствия попыток заслужить и контролировать, доверяя принципам. Твоим, не навязанным.",
        "Темперамент": "Темперамент - это фундамент твоей психики. Тест выявляет врожденные и неизменные свойства, которые с тобой навсегда. Результат объясняет, почему ты ведешь себя определенным образом в стрессе или радости и как это использовать с пользой.",
        "Общительность": "Вспомни людей, с которыми ты общаешься. Насколько ты обычно вовлечен в диалог с ними? Общение было бы гораздо интереснее и приносило бы больше пользы, если бы ты четко понимал, в каком стиле тебе приятно общаться.",
        "Профориентация": "Согласись, в работе есть моменты, которые наполняют и которые выжигают. Задача профориентации - выделить все, что приносит радость и энергию в действии, что хочется масштабировать и вкладываться, а что не твоё и нужно избегать. Этим отличаются победители, они попали, но ты можешь прийти осознанно и видеть всегда.\n\nТакже сделай отчёты по профориентации, чтобы понимать, на какую ответственность ты готов с точки зрения энергии и чувства компетентности. Когда ты это понимаешь, получается баланс. Дневник поможет все это аккуратно ввести в жизнь так, как свойственно именно тебе."
    }
    
    text = descriptions.get(callback_data.name, "Описание не найдено.")
    
    builder = InlineKeyboardBuilder()
    builder.button(
        text="Открыть тесты",
        web_app=WebAppInfo(url=settings.WEB_APP_URL + "?tab=tests")
    )
    builder.button(text="Назад", callback_data=AboutTests().pack())
    builder.adjust(1)
    
    image_name = f"{callback_data.name.lower()}.png"
    image_path = IMAGES / image_name
    
    import pathlib
    real_path = pathlib.Path(image_path)
    if not real_path.exists():
        image_name = f"{callback_data.name.lower()}.jpg"
        image_path = IMAGES / image_name
    
    msg = await bot.send_photo(
        chat_id=user.id,
        photo=FSInputFile(image_path),
        caption=text,
        reply_markup=builder.as_markup()
    )
        
    await schedule_message_edition(user, msg)

@dp.callback_query(Psychologist.filter())
async def Psychologist_callback(
        callback: CallbackQuery, user: User, state: FSMContext
):
    await bot.send_message(
        chat_id=settings.REQUESTS_CHAT_ID,
        text=gettext("messages.psychologist.request_success.for_chat").format(
            user_id=user.id,
            username=f"@{user.username}" if user.username else "Отсутствует",
            name=user.tg_first_name or "Отсутствует"
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
    msg = await bot.send_photo(
        chat_id=user.id,
        photo=FSInputFile(IMAGES / "связь.jpg"),
        caption="Здесь ты можешь оставить обратную связь и получить техподдержку, а также мы поможем найти идеального лично для тебя психолога и качественное обучение по близкому тебе направлению.",
        reply_markup=menu_kb()
    )
    await schedule_message_edition(user, msg)


@dp.message(StateFilter(TechStates.message))
async def TechStatesMessage_handler(
        message: Message, user: User, state: FSMContext
):
    await bot.send_message(
        chat_id=settings.SUPPORT_CHAT_ID,
        text=gettext("messages.tech_support.request_success.for_chat").format(
            user_id=user.id,
            username=f"@{user.username}" if user.username else "Отсутствует",
            name=user.tg_first_name or "Отсутствует",
            request=message.text
        )
    )
    await message.delete()
    await state.clear()
    await edit_scheduled_message(
        user=user,
        text=gettext("messages.tech_support.request_success.for_user"),
        kb=menu_kb()
    )
