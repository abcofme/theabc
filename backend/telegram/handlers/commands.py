from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from backend.database.models import User
from backend.telegram.bot import dp
from backend.telegram.callback_data.base import Back
from backend.telegram.utils.message import (
    back_to_previous_message, delete_pending_messages, schedule_message_edition
)


@dp.callback_query(Back.filter())
async def back_handler(
        callback: CallbackQuery, callback_data: Back,
        user: User, state: FSMContext
):
    await callback.answer()
    await delete_pending_messages(user)
    # if callback_data.delete:
    try:
        await callback.message.delete()
    except:
        pass
    msg = await back_to_previous_message(user, state, True)
    await schedule_message_edition(user, msg)
    # else:
    #     await back_to_previous_message(user, state)
