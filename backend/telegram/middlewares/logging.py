from typing import Callable, Awaitable, Dict, Any

from aiogram import BaseMiddleware
from aiogram.dispatcher.event.handler import HandlerObject
from aiogram.types import TelegramObject, Update
from aiogram.types import User as TelegramUser
from loguru import logger


class LoggingMiddleware(BaseMiddleware):
    async def __call__(
            self,
            handler: Callable[[TelegramObject, Dict[str, Any]], Awaitable[Any]],
            update: Update,
            data: Dict[str, Any],
    ) -> Any:
        # logger.debug(update.json())
        _handler: HandlerObject = data['handler']
        tg_user: TelegramUser = data["event_from_user"]
        logger.opt(colors=True).info(
            f'Handler <green>{_handler.callback.__name__}</green> called by user <green>{tg_user.id}</green>'
        )
        return await handler(update, data)
