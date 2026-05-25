from typing import Callable, Awaitable, Dict, Any

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from backend.database.patterns.dao import DataAccessObject


class SessionMiddleware(BaseMiddleware):
    def __init__(self, engine: AsyncEngine):
        super().__init__()
        self.engine = engine

    async def __call__(
            self,
            handler: Callable[[TelegramObject, Dict[str, Any]], Awaitable[Any]],
            event: TelegramObject,
            data: Dict[str, Any],
    ) -> Any:
        async with AsyncSession(self.engine, expire_on_commit=False) as session:
            try:
                data["dao"] = DataAccessObject(session)
                return await handler(event, data)
            finally:
                await session.close()
