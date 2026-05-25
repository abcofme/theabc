import asyncio

from loguru import logger

from backend.database import engine
from backend.database.base import Base
from backend.database.connect import create_all_tables
from backend.logs.logs import configure_logger
from backend.scheduler import scheduler
from backend.telegram.bot import dp, bot
from backend.telegram.middlewares import register_middlewares
from migrate import run_async_upgrade

configure_logger()


async def start_app():
    # -> Logging
    logger.info("-> Bot online")

    await create_all_tables(engine, Base.metadata)
    await run_async_upgrade()
    register_middlewares(bot)

    from backend.telegram import handlers  # NOQA

    await bot.delete_webhook()

    scheduler.start()

    await asyncio.gather(
        dp.start_polling(
            bot,
            allowed_updates=dp.resolve_used_update_types(),
        )
    )


if __name__ == '__main__':
    asyncio.run(start_app())
