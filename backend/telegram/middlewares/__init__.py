from aiogram import Bot
from aiogram.client.session.middlewares.request_logging import RequestLogging

from backend.database import engine
from backend.redis_db import async_redis
from backend.telegram.bot import dp
from backend.telegram.middlewares.album import AlbumMiddleware
from backend.telegram.middlewares.anitspam import AntiSpamMiddleware, AntiSpam
from backend.telegram.middlewares.localization import DatabaseI18nMiddleware
from backend.telegram.middlewares.logging import LoggingMiddleware
from backend.telegram.middlewares.session import SessionMiddleware
from backend.telegram.middlewares.throttler import ThrottlerMiddleware
from backend.telegram.middlewares.user import UserMiddleware


# outer -> filter -> middleware -> handler

def register_bot_middlewares(bot: Bot):
    bot.session.middleware.register(ThrottlerMiddleware())
    bot.session.middleware(RequestLogging())


def register_dp_middlewares():
    dp.update.outer_middleware(SessionMiddleware(engine=engine))
    dp.update.outer_middleware(UserMiddleware())
    dp.update.outer_middleware(DatabaseI18nMiddleware())
    dp.update.outer_middleware(AlbumMiddleware())
    dp.update.outer_middleware(AntiSpamMiddleware(AntiSpam(async_redis)))
    for name, observer in dp.observers.items():
        if name not in ('error', 'update'):
            observer.middleware.register(LoggingMiddleware())


def register_middlewares(bot: Bot):
    register_dp_middlewares()
    register_bot_middlewares(bot)
