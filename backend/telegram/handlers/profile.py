from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from backend.telegram.bot import dp
from backend.telegram.callback_data.profile import Profile
from backend.telegram.keyboards.tests import *
from backend.telegram.utils.message import (
    edit_scheduled_message, schedule_previous_message, delete_pending_messages
)


# @dp.callback_query(Profile.filter())
# async def Profile_callback(
#         callback: CallbackQuery, callback_data: Profile,
#         user: User, state: FSMContext, dao: DataAccessObject
# ):
#     await schedule_previous_message(user, callback.message, state)
#     # await delete_pending_messages(user)
#     progresses: list[Progress] = await ProgressDAO(dao).get_from_user(user.id)
#     text = gettext("messages.profile.results")
#     for progress in progresses:
#         if progress.hardcode_value:
#             text += f"{progress.test.name}\n{progress.hardcode_value}\n\n"
#         else:
#             result = await ResultDAO(dao).get_by_points(progress.test_id, progress.value)
#             result_text = upcase_first_letter(result.name) if result else ""
#             test_name = upcase_first_letter(progress.test.name) if progress.test else ""
#             text += f"{test_name}\n{result_text}\n\n"
#
#     if len(text) < 1024:
#         await edit_scheduled_message(
#             user=user,
#             text=text,
#             kb=back_kb()
#         )
#     else:
#         await delete_editing_message(user)
#         texts = split_string(text)
#         for i, msg_text in enumerate(texts, start=1):
#             if i == len(texts):
#                 msg = await bot.send_message(
#                     chat_id=user.id,
#                     text=msg_text,
#                     reply_markup=back_kb()
#                 )
#                 await schedule_message_deletion(user, msg)
#             else:
#                 msg = await bot.send_message(
#                     chat_id=user.id,
#                     text=msg_text
#                 )
#                 await schedule_message_deletion(user, msg)


@dp.callback_query(Profile.filter())
async def Profile_callback(
        callback: CallbackQuery, callback_data: Profile,
        user: User, state: FSMContext, dao: DataAccessObject
):
    await schedule_previous_message(user, callback.message, state)
    await delete_pending_messages(user)
    await edit_scheduled_message(
        user=user,
        text="📊Результаты ваших тестирований📊\n📋Выберите категорию тестов:",
        kb=await category_tests_kb(dao=dao, user=user, profile=True, is_profile=True),
        media_group=True
    )
