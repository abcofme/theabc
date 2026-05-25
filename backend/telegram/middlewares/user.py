from typing import Callable, Awaitable, Dict, Any

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject
from aiogram.types import User as TelegramUser

from backend.database.models import User
from backend.database.patterns.dao import DataAccessObject


class UserMiddleware(BaseMiddleware):
    async def __call__(
            self,
            handler: Callable[[TelegramObject, Dict[str, Any]], Awaitable[Any]],
            event: TelegramObject,
            data: Dict[str, Any],
    ) -> Any:
        dao: DataAccessObject = data["dao"]
        tg_user: TelegramUser = data["event_from_user"]
        user = await dao.get_object(User, tg_user.id)
        if user is None:
            new_user = User(
                id=tg_user.id,  # NOQA
                tg_first_name=tg_user.first_name,  # NOQA
                tg_last_name=tg_user.last_name or None,  # NOQA
                username=tg_user.username or None  # NOQA
            )
            await dao.add_object(new_user, autoincrement=False)  # NOQA
            user = await dao.get_object(User, tg_user.id)
        elif user.username != tg_user.username or user.tg_first_name != tg_user.first_name:
            await dao.update_object(
                User, user.id, dict(
                    tg_first_name=tg_user.first_name,
                    tg_last_name=tg_user.last_name or None,
                    username=tg_user.username or None
                )
            )
            user = await dao.refresh(user)

        data["user"] = user
        return await handler(event, data)
