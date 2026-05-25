from typing import Union, Dict, Any

from aiogram import types
from aiogram.filters import BaseFilter
from aiogram.fsm.context import FSMContext
from loguru import logger

from backend.database.models import User
from backend.database.patterns.dao import DataAccessObject
from backend.telegram.bot import bot


class InvitedFilter(BaseFilter):
    async def __call__(
            self, message: types.Message, state: FSMContext,
            user: User, dao: DataAccessObject
    ) -> Union[bool, Dict[str, Any]]:
        if message.text.startswith("/start ") and len(message.text) > 7:
            text = message.text.split(' ')[-1]
            if text.startswith("invite_") and len(text) > 7:
                if user.invited_id is not None:
                    return False
                else:
                    try:
                        invited_id = int(text.split("_")[-1])
                        # invite_user = await dao.get_object(User, invited_id)
                        # if invite_user:
                        #     invite_pct = invite_user.discount_pct or 0
                        #     if invite_pct < 100:
                        #         await dao.update_object(User, invited_id, dict(
                        #             discount_pct=invite_pct + 10
                        #         ))
                        #         await bot.send_message(
                        #             chat_id=invited_id,
                        #             text=f"Ваша новая скидка: {invite_pct + 10}%"
                        #         )
                        #     before_pct = user.discount_pct or 0
                        #     await dao.update_object(User, user.id, dict(
                        #         discount_pct=before_pct + 10
                        #     ))
                        #     await bot.send_message(
                        #         chat_id=user.id,
                        #         text=f"Ваша новая скидка: {before_pct + 10}%"
                        #     )
                    except Exception as e:
                        logger.error(f"InviteFilter: {e.__str__()}")
                        invited_id = text.split("_")[-1]
                    await dao.update_object(User, user.id, dict(invited_id=str(invited_id)))
        return True
