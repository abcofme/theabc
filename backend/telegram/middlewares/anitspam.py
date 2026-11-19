from functools import wraps
from typing import Callable, Awaitable, Dict, Any

from aiogram import BaseMiddleware
from aiogram.types import Message, CallbackQuery, Update
from aiogram.types import TelegramObject
from redis.asyncio import Redis


class AntiSpam:
    def __init__(self, redis_client: Redis):
        self.redis_client = redis_client

    async def is_action_allowed(self, user_id: int, action: str, limit: float = 5.0) -> bool:
        key = f"antispam:{user_id}:{action}"
        return bool(await self.redis_client.set(key, 1, nx=True, px=round(limit * 1000)))

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
            is_media = message.photo is not None or message.document is not None
            if not is_media and not await self.anti_spam.is_action_allowed(message.from_user.id, "message", 1.1111):
                return
        elif isinstance(event.callback_query, CallbackQuery):
            callback = event.callback_query
            if not await self.anti_spam.is_action_allowed(callback.from_user.id, "callback", 0.8):
                await callback.answer("Не так быстро — подожди секунду", show_alert=False)
                return
        data["anti_spam"] = self.anti_spam
        return await handler(event, data)
