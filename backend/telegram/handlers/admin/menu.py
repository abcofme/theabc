from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery
from aiogram.utils.i18n import gettext
from loguru import logger

from backend.database.models import User
from backend.database.patterns.dao import DataAccessObject
from backend.database.patterns.user import UserDAO
from backend.telegram.bot import dp, bot
from backend.telegram.callback_data.admin import AdminMenu
from backend.telegram.filters.admin import AdminCallbackFilter, AdminMessageFilter
from backend.telegram.keyboards.admin.menu import admin_menu_kb
from backend.telegram.states.admin import AdminStates
from backend.telegram.utils.message import (
    edit_scheduled_message, schedule_previous_message, Message, schedule_message_deletion, delete_pending_messages
)
from settings import settings


@dp.callback_query(AdminMenu.filter(), AdminCallbackFilter())
async def AdminMenu_callback(
        callback: CallbackQuery, callback_data: AdminMenu,
        user: User, state: FSMContext, dao: DataAccessObject
):
    await schedule_previous_message(user, callback.message, state)
    # await delete_pending_messages(user)
    await state.set_state(AdminStates.link)
    counts = await UserDAO(dao).get_invited_id_counts()
    by_links = ""
    logger.info(f"LINKS: {counts}")
    for key, value in counts.items():
        key: str
        if key is None or key.isdigit():
            continue
        else:
            by_links += (
                f"<blockquote>{settings.BOT_LINK}?start=invite_{key}</blockquote>\n"
                f"Всего: {value[0]} чел.\n"
                f"Совершили покупку: {value[1]} чел.\n\n"
            )

    await edit_scheduled_message(
        user=user,
        text=gettext("messages.admin.menu").format(
            by_links=by_links
        ),
        kb=admin_menu_kb()
    )


@dp.message(StateFilter(AdminStates.link), AdminMessageFilter())
async def AdminStatesLink_handler(
        message: Message, user: User, state: FSMContext
):
    msg = await bot.send_message(
        chat_id=user.id,
        text=f"{settings.BOT_LINK}?start=invite_{message.text}"
    )
    await message.delete()
    await schedule_message_deletion(user, msg)
