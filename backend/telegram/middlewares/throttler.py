from aiogram import Bot
from aiogram.client.session.middlewares.base import BaseRequestMiddleware, NextRequestMiddlewareType
from aiogram.methods import TelegramMethod, Response
from aiogram.methods.base import TelegramType
from asyncio_throttle import Throttler

FLOOD_THROTTLER = Throttler(rate_limit=25)


class ThrottlerMiddleware(BaseRequestMiddleware):
    async def __call__(
            self,
            make_request: NextRequestMiddlewareType[TelegramType],
            bot: Bot,
            method: TelegramMethod[TelegramType],
    ) -> Response[TelegramType]:
        async with FLOOD_THROTTLER:
            response = await make_request(bot, method)
        return response
