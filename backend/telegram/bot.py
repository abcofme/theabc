import ssl

from aiogram import Bot, Dispatcher, enums
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.client.telegram import TelegramAPIServer
from aiogram.fsm.storage.redis import RedisStorage

from backend.redis_db import async_redis
from settings import settings


def create_session() -> AiohttpSession | None:
    # Без TELEGRAM_API_URL бот ходит напрямую в api.telegram.org
    if not settings.TELEGRAM_API_URL:
        return None
    session = AiohttpSession(api=TelegramAPIServer.from_base(settings.TELEGRAM_API_URL))
    if settings.TELEGRAM_API_CA_FILE:
        # У ретранслятора самоподписанный сертификат: доверяем только ему
        session._connector_init["ssl"] = ssl.create_default_context(cafile=settings.TELEGRAM_API_CA_FILE)
    return session


bot = Bot(token=settings.BOT_TOKEN, parse_mode=enums.ParseMode.HTML, session=create_session())
dp = Dispatcher(bot=bot, storage=RedisStorage(redis=async_redis))
