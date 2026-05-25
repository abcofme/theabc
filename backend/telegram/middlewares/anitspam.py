import asyncio
from functools import wraps
from typing import Callable, Awaitable, Dict, Any

from aiogram import BaseMiddleware
from aiogram.dispatcher.event.bases import CancelHandler
from aiogram.types import Message, CallbackQuery, Update
from aiogram.types import TelegramObject
from aiogram.utils.i18n import gettext
from loguru import logger

from backend.redis_db import RedisWorker


class AntiSpam:
    def __init__(self, redis_client):
        self.redis_worker = RedisWorker(redis_client)
        self.logger = logger

    async def is_action_allowed(self, user_id: int, action: str, limit: float = 5.0) -> bool:
        key = f"antispam:{user_id}"
        user_data = await self.redis_worker.get_data(key) or {}
        current_time = asyncio.get_event_loop().time()
        action_data = user_data.get(action)
        if action_data:
            last_action_time, attempts = action_data
            time_diff = current_time - last_action_time
            if time_diff < limit:
                attempts += 1
                user_data[action] = [current_time, attempts]
                await self.redis_worker.save_data(key, user_data)
                if attempts >= 3:
                    return False
                return False
            if 'blocked_until' in user_data and current_time < user_data['blocked_until']:
                return False
            user_data[action] = [current_time, 1]
        else:
            user_data[action] = [current_time, 1]
        await self.redis_worker.save_data(key, user_data)
        return True

    def rate_limit(self, action: str, limit: int = 5):
        def decorator(func):
            @wraps(func)
            async def wrapper(message: Message, *args, **kwargs):
                user_id = message.from_user.id
                if not await self.is_action_allowed(user_id, action, limit):
                    return
                return await func(message, *args, **kwargs)

            return wrapper

        return decorator


class AntiSpamMiddleware(BaseMiddleware):
    def __init__(self, anti_spam: AntiSpam):
        super().__init__()
        self.anti_spam = anti_spam

    async def __call__(
            self,
            handler: Callable[[TelegramObject, Dict[str, Any]], Awaitable[Any]],
            event: Update,
            data: Dict[str, Any],
    ) -> Any:
        if isinstance(event.message, Message):
            message = event.message
            await self.on_process_message(message, data)
        if isinstance(event.callback_query, CallbackQuery):
            message = event.callback_query
            await self.on_process_callback_query(message, data)
        return await handler(event, data)

    async def on_process_message(self, message: Message, data: dict):
        user_id = message.from_user.id
        is_allowed = await self.anti_spam.is_action_allowed(user_id, "action", 1.1111)
        if not is_allowed and message.photo is None and message.document is None:
            raise CancelHandler()
        data['anti_spam'] = self.anti_spam

    async def on_process_callback_query(self, callback: CallbackQuery, data: dict):
        user_id = callback.from_user.id
        is_allowed = await self.anti_spam.is_action_allowed(user_id, "action", 0.8)
        if not is_allowed:
            await callback.answer("Не нажимайте кнопки слишком часто!", show_alert=False)
            raise CancelHandler()
        data['anti_spam'] = self.anti_spam
