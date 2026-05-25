from aiogram.filters import CommandStart, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import Message, CallbackQuery, FSInputFile
from aiogram.utils.i18n import gettext
from aiogram.utils.keyboard import InlineKeyboardBuilder

from backend.database.models import User
from backend.database.patterns.dao import DataAccessObject
from backend.database.patterns.user import UserDAO
from backend.telegram.bot import dp, bot
from backend.telegram.callback_data.profile import Psychologist, TechSupport, MainMenu, Referal
from backend.telegram.filters.invite import InvitedFilter
from backend.telegram.keyboards.base import back_kb
from backend.telegram.keyboards.start import start_kb, main_menu_btn
from backend.telegram.states.user import TechStates
from backend.telegram.utils.message import (
    schedule_message_edition,
    delete_pending_messages,
    delete_editing_message, edit_scheduled_message,
    schedule_previous_message
)
from paths import IMAGES
from settings import settings


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
        caption=gettext("messages.start.welcome"),
        reply_markup=start_kb(user)
    )
    await schedule_message_edition(user, msg)


@dp.callback_query(MainMenu.filter())
async def start_callback(
        callback: CallbackQuery, user: User, state: FSMContext
):
    await callback.message.delete()
    await delete_pending_messages(user)
    await delete_editing_message(user)
    await state.clear()

    msg = await bot.send_photo(
        chat_id=user.id,
        photo=FSInputFile(IMAGES / f"приветствие.png"),
        caption=gettext("messages.start.welcome"),
        reply_markup=start_kb(user)
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
    await schedule_previous_message(user, callback.message, state)
    await state.set_state(TechStates.message)
    await edit_scheduled_message(
        user=user,
        text="Отправьте ваш запрос в тех. поддержку",
        kb=back_kb()
    )


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
        kb=InlineKeyboardBuilder([[main_menu_btn]]).as_markup()
    )


@dp.callback_query(Referal.filter())
async def Referal_callback(
        callback: CallbackQuery, user: User, state: FSMContext, dao: DataAccessObject
):
    await schedule_previous_message(user, callback.message, state)
    # await delete_pending_messages(user)
    user_invited_count = await UserDAO(dao).get_user_invited_count(str(user.id))
    await edit_scheduled_message(
        user=user,
        text=f"От тебя пришло: {user_invited_count} чел.\n\n"
             f"Твоя скидка: {user.discount_pct or 0}%\n\n"
             f"Приводи друзей по ссылке и получай скидку 10% за каждого! "
             f"За 10 приведенных друзей все тесты бесплатно, за 2 приведенных друзей "
             f"скидка 20% на работу с психологом сохраняется навсегда\n\n"
             f"{settings.BOT_LINK}?start=invite_{user.id}",
        kb=back_kb()
    )
