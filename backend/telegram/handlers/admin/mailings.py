from datetime import datetime

from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message
from aiogram.utils.i18n import gettext

from backend.database.models import User, Mailing
from backend.database.patterns.dao import DataAccessObject
from backend.telegram.bot import dp, bot
from backend.telegram.callback_data.admin import (
    AdminCreateMailing, AdminAcceptCreateMailing
)
from backend.telegram.filters.admin import AdminCallbackFilter, AdminMessageFilter
from backend.telegram.keyboards.admin.mailings import admin_accept_mailings_kb
from backend.telegram.keyboards.start import menu_kb
from backend.telegram.states.admin import AdminMailingStates
from backend.telegram.utils.message import (
    schedule_previous_message,
    edit_scheduled_message,
    delete_previous_message,
    schedule_message_edition
)


# @dp.callback_query(AdminMenuMailings.filter(), AdminCallbackFilter())
# async def admin_menu_mailings_callback(
#         callback: CallbackQuery, callback_data: AdminMenuMailings,
#         user: User, dao: DataAccessObject, state: FSMContext
# ):
#     await schedule_previous_message(user, callback.message, state)
#     await edit_scheduled_message(
#         user,
#         gettext("messages.admin.mailings"),
#         kb=admin_menu_mailings_kb()
#     )


@dp.callback_query(AdminCreateMailing.filter(), AdminCallbackFilter())
async def admin_menu_mailings_callback(
        callback: CallbackQuery, callback_data: AdminCreateMailing,
        user: User, dao: DataAccessObject, state: FSMContext
):
    await schedule_previous_message(user, callback.message, state)
    await state.set_state(AdminMailingStates.message)
    msg = await edit_scheduled_message(
        user,
        gettext("messages.admin.mailings.create.insert_message")
    )
    await schedule_previous_message(user, msg, state)


@dp.message(StateFilter(AdminMailingStates.message), AdminMessageFilter())
async def admin_menu_mailings_callback(
        message: Message,
        user: User, dao: DataAccessObject, state: FSMContext
):
    await delete_previous_message(user)
    await state.update_data(
        dict(
            chat_id=str(message.chat.id),
            messages=[str(message.message_id)]
        )
    )
    copy_msg = await bot.copy_message(
        chat_id=user.id,
        from_chat_id=str(message.chat.id),
        message_id=message.message_id
    )
    msg = await bot.send_message(
        chat_id=user.id,
        text=gettext("messages.admin.mailings.accept_create"),
        reply_markup=admin_accept_mailings_kb()
    )
    await state.set_state(AdminMailingStates.accept)
    await schedule_message_edition(user, msg)


@dp.callback_query(AdminAcceptCreateMailing.filter(), AdminCallbackFilter())
async def admin_menu_mailings_callback(
        callback: CallbackQuery,
        user: User, dao: DataAccessObject, state: FSMContext,
):
    data = await state.get_data()
    mailing = Mailing(
        chat_id=data.get("chat_id"),  # NOQA
        message_ids=data.get("messages"),  # NOQA
        user_id=user.id,  # NOQA
        scheduled_at=datetime.now()  # NOQA
    )
    await dao.add_object(mailing)  # NOQA

    await edit_scheduled_message(
        user,
        gettext("messages.admin.mailings.create.successful"),
        kb=menu_kb()
    )
    await state.clear()
