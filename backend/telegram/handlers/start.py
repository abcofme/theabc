from aiogram.filters import CommandStart, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import Message, CallbackQuery, FSInputFile, InputMediaPhoto
from aiogram.utils.i18n import gettext
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.types import InlineKeyboardButton
from aiogram.types.web_app_info import WebAppInfo

from backend.database.models import User
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


START_TEXT = "«Азбука Я» — ваш личный инструмент целостности в повседневной жизни, объедяющий теорию психологии, философии и искусственный интеллект с целью возвращать человека к самому себе — каким он был задуман"

@dp.message(CommandStart(), InvitedFilter())
async def start_handler(
        _: Message, user: User, state: FSMContext
):
    await delete_pending_messages(user)
    await delete_editing_message(user)
    await state.clear()

    msg = await bot.send_photo(
        chat_id=user.id,
        photo=FSInputFile(IMAGES / f"приветствие.png"),
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
        photo=FSInputFile(IMAGES / f"приветствие.png"),
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
        "Дневник позволяет увидеть какие события происходят с нами чаще всего, "
        "насколько реакция на них близка к психологическому портрету и другое. "
        "Попробуй союз результатов психологии и искусственного интеллекта "
        "направленные на избавление твоей личности от одиночества"
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
        "В “Азбуке Я” мы собрали тесты, которые лучшие психодиагносты творили, проверяли на практике и улучшали все время существования науки, а дневник позволяет увидеть какие события происходят с нами чаще всего, насколько реакция на них близка к психологическому портрету и другое. Попробуй союз результатов психологии и искусственного интеллекта направленные на избавление твоей личности от одиночества без твоей лучшей версии\n\n"
        "Человек всегда может меняться и мы даем точный инструмент знакомства с самим собой, отслеживания своего поведения и предрасположенностей, но не спасение от всех бед. Все зависит лишь от тебя. Точность зависит от правдивости ответов, выбирай тот, который первым приходит в голову и кажется более точным, чем другой. Проходи тесты спокойным и расслабленным"
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
        "Личность": "Пути которыми ты шел по жизни сформировали личность. Привычки, сценарии поведения, что для тебя действительно важно. Все это формирует твои сильные и слабые стороны. Их важно понимать и учится с ними работать, чтобы жить лучшей жизнью, которой ты можешь",
        "Самооценка": "Все люди ощущают самих себя по разному. Как ощущаешь себя ты? И как это чувство транслируешь окружающим? Неудовлетворенность жизнью от завышенных ожиданий, а полная свобода и чувство полета, наполненности от отсутствия попыток заслужить и контролировать, доверяя принципам",
        "Темперамент": "Темперамент - это фундамент твоей психики. Тест выявляет врожденные и неизменные свойства, которые с тобой навсегда. Результат объясняет, почему ты ведешь себя определенным образом в стрессе или радости и как это использовать с пользой",
        "Общительность": "Вспомни людей, с которыми ты общаешься. Насколько ты обычно вовлечен в диалог с ними? Общение было бы гораздо интереснее и приносило бы больше результатов, если бы ты четко понимал в каком стиле тебе хочется общаться",
        "Профориентация": "Из всех существующих профессиональных сфер существует узкий круг, где ты будешь одновременно эффективнее и счастливее всего. Кто занимается любимым делом, тому приятно вкладываться, делать качественно свою работу и соответственно его везде будут окружать такие же специалисты"
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
        caption="Здесь ты можешь оставить обратную связь и получить техподдержку, а также мы поможем найти идеального лично для тебя психолога и качественное обучение по ближайшему по результатам всех тестов направлению",
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
