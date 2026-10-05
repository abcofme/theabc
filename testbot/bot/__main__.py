import asyncio
import logging

from aiogram import Bot, Dispatcher, enums
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.types import BotCommand

from . import config
from .backend import Backend
from .handlers import router


async def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    bot = Bot(token=config.BOT_TOKEN, parse_mode=enums.ParseMode.HTML)
    storage = RedisStorage.from_url(config.REDIS_URL, state_ttl=config.PROGRESS_TTL, data_ttl=config.PROGRESS_TTL)
    backend = Backend()

    dp = Dispatcher(storage=storage, backend=backend)
    dp.include_router(router)

    await bot.set_my_commands([
        BotCommand(command="start", description="Главное меню"),
        BotCommand(command="tests", description="Тесты по категориям"),
        BotCommand(command="results", description="Мои результаты"),
    ])
    await bot.delete_webhook()
    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        await backend.close()
        await storage.close()


if __name__ == "__main__":
    asyncio.run(main())
