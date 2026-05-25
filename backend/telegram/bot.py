from aiogram import Bot, Dispatcher, enums
from aiogram.fsm.storage.redis import RedisStorage

from backend.redis_db import async_redis
from settings import settings

bot = Bot(token=settings.BOT_TOKEN, parse_mode=enums.ParseMode.HTML)
dp = Dispatcher(bot=bot, storage=RedisStorage(redis=async_redis))


