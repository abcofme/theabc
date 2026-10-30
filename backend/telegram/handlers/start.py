import html

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
from backend.friends import befriend, inviter_from_payload
from backend.telegram.notify import greet_new_friend
from backend.database.patterns.user import UserDAO
from backend.telegram.bot import dp, bot
from backend.telegram.callback_data.profile import Psychologist, TechSupport, MainMenu, AboutDiary, AboutTests, TestCategoryDesc
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


START_TEXT = (
    "🌿 <b>Это «Азбука Я»</b>\n\n"
    "Здесь ты узнаешь свои <b>настоящие потребности</b> и увидишь, как их реализовать.\n\n"
    "✍️ <b>Дневник</b> — события дня и твои реакции на них\n"
    "🧩 <b>Тесты</b> — твой психологический портрет\n"
    "📊 <b>Отчеты</b> — что повторяется и куда уходит энергия\n\n"
    "<i>Начни с личного дневника или узнай, как всё устроено</i> 👇"
)

@dp.message(CommandStart(), InvitedFilter())
async def start_handler(
        message: Message, user: User, state: FSMContext, dao: DataAccessObject
):
    payload = message.text.split(" ")[-1] if message.text and message.text.startswith("/start ") else None
    if user.tracking_link_id is None and payload and payload.startswith("tr_"):
        code = payload[3:]
        link = await dao.session.scalar(select(TrackingLink).where(TrackingLink.code == code))
        if link:
            await dao.update_object(User, user.id, dict(tracking_link_id=link.id))

    # Личная ссылка-приглашение друга: дружба сразу принята, пригласившему — сообщение
    inviter_id = inviter_from_payload(payload)
    if inviter_id and await befriend(dao.session, user.id, inviter_id):
        await greet_new_friend(user, inviter_id)

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
        "📔 <b>Личный дневник</b>\n\n"
        "Мы живём в эпоху бесконечного потребления. Удержать в голове все свои потребности, желания "
        "и неудовлетворённости мозг уже не может — для выживания это давно не нужно. "
        "<b>Зато нам помогают технологии.</b> Например, дневник.\n\n"
        "<b>Как он работает</b>\n"
        "✍️ Ты записываешь событие и свою реакцию\n"
        "🧭 Дневник сверяет её с твоими тестами и подсказывает, какая реакция ближе всего к твоей натуре\n"
        "📊 Из записей складываются отчеты — они помогают корректировать путь и двигаться к лучшему\n\n"
        "<blockquote>💡 Чем чаще пишешь, тем точнее отчеты.</blockquote>"
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
        "🧩 <b>Тесты</b>\n\n"
        "Мозг склонен переоценивать собственный опыт. Поэтому учёные веками создавали и выверяли "
        "психодиагностические тесты, которые <b>объективно описывают личность целиком</b>. "
        "Мы собрали лучшие из них в удобном формате.\n\n"
        "<b>Что ты получишь</b>\n"
        "🧠 Полный психологический портрет: сильные и слабые стороны, особенности\n"
        "📔 Дневник дополнит его жизненным опытом и поможет перенести теорию в практику\n\n"
        "<blockquote>💡 <b>Как проходить</b>\n"
        "В спокойном, расслабленном состоянии. Выбирай ответ, "
        "который первым пришёл в голову и правда кажется тебе точнее.</blockquote>\n\n"
        "<i>Нажми на раздел ниже, чтобы узнать о нём подробнее</i> 👇"
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
        "Личность": (
            "🍁 <b>Личность</b>\n\n"
            "Личность складывается из того, как ты идёшь по жизни:\n"
            "• из привычек\n"
            "• из сценариев поведения\n"
            "• из того, что для тебя по-настоящему важно\n\n"
            "Отсюда — <b>твои сильные и слабые стороны</b>.\n\n"
            "<blockquote>Их важно понимать и учиться с ними работать, чтобы жить так хорошо, "
            "как только можешь.</blockquote>"
        ),
        "Самооценка": (
            "🍇 <b>Самооценка</b>\n\n"
            "<i>Каждый ощущает себя по-своему. А как ощущаешь себя ты? "
            "И что этим транслируешь окружающим?</i>\n\n"
            "Можно жить в неудовлетворённости из-за завышенных ожиданий. А можно — в свободе, "
            "с ощущением полёта и наполненности, когда не пытаешься ничего заслужить и всё контролировать, "
            "а доверяешь принципам.\n\n"
            "<blockquote><b>Своим, а не навязанным.</b></blockquote>"
        ),
        "Темперамент": (
            "🌳 <b>Темперамент</b>\n\n"
            "Темперамент — <b>фундамент твоей психики</b>. Тест выявляет врождённые свойства, "
            "которые не меняются и остаются с тобой навсегда.\n\n"
            "<b>Результат объяснит</b>\n"
            "• почему в стрессе или в радости ты ведёшь себя именно так\n"
            "• как обратить это себе на пользу"
        ),
        "Общительность": (
            "🫒 <b>Общительность</b>\n\n"
            "<i>Вспомни людей, с которыми общаешься. Насколько глубоко ты обычно включаешься в разговор?</i>\n\n"
            "Общение становится интереснее и полезнее, когда ты точно знаешь, "
            "<b>в каком стиле тебе приятно общаться</b>."
        ),
        "Профориентация": (
            "🌿 <b>Профориентация</b>\n\n"
            "Согласись, в работе есть то, что наполняет, и то, что выжигает. Профориентация помогает их разделить:\n"
            "🌱 что приносит радость и энергию, во что хочется вкладываться и что развивать\n"
            "🍂 что не твоё и чего лучше избегать\n\n"
            "Многим успешным людям просто повезло попасть на своё место. <b>Ты можешь прийти к нему "
            "осознанно</b> — и всегда видеть, куда идёшь.\n\n"
            "<blockquote>📊 Сделай и отчеты по профориентации — «Энергия» и «Чувство компетентности». "
            "Они покажут, какую ответственность тебе по силам взять на себя. Когда это понятно, появляется баланс. "
            "А дневник поможет бережно встроить всё это в жизнь — так, как свойственно именно тебе.</blockquote>"
        ),
    }
    
    text = descriptions.get(callback_data.name, "Описание не найдено.")
    
    builder = InlineKeyboardBuilder()
    builder.button(
        text="🧩 Открыть тесты",
        web_app=WebAppInfo(url=settings.WEB_APP_URL + "?tab=tests")
    )
    builder.button(text="← Назад", callback_data=AboutTests().pack())
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
    msg = await bot.send_photo(
        chat_id=user.id,
        photo=FSInputFile(IMAGES / "связь.jpg"),
        caption=(
            "💬 <b>Связь</b>\n\n"
            "Здесь можно:\n"
            "• оставить обратную связь\n"
            "• обратиться в техподдержку\n"
            "• подобрать психолога, который подойдёт именно тебе\n"
            "• найти качественное обучение по близкому тебе направлению\n\n"
            "✍️ <b>Просто напиши сообщение в этот чат.</b>"
        ),
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
