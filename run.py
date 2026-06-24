import asyncio
import uvicorn # <-- НОВЫЙ ИМПОРТ
from loguru import logger

from backend.database import engine
from backend.database.base import Base
from backend.database.connect import create_all_tables
from backend.logs.logs import configure_logger
from backend.scheduler import scheduler
from backend.telegram.bot import dp, bot
from backend.telegram.middlewares import register_middlewares
from migrate import run_async_upgrade
from backend.api.main import app as fastapi_app # <-- НОВЫЙ ИМПОРТ

configure_logger()

async def start_app():
    logger.info("-> Bot online")

    await create_all_tables(engine, Base.metadata)
    await run_async_upgrade()
    
    try:
        from backend.migrate import migrate
        await migrate()
    except Exception as e:
        logger.error(f"Failed to run backend migrations: {e}")
        
    register_middlewares(bot)

    from backend.telegram import handlers  # NOQA

    await bot.delete_webhook()
    scheduler.start()

    # --- НОВЫЙ КОД ЗАПУСКА FASTAPI ---
    config = uvicorn.Config(app=fastapi_app, host="0.0.0.0", port=8000, loop="asyncio")
    server = uvicorn.Server(config)
    
    # Запускаем и бота, и сервер API одновременно
    await asyncio.gather(
        server.serve(),
        dp.start_polling(
            bot,
            allowed_updates=dp.resolve_used_update_types(),
        )
    )

if __name__ == '__main__':
    asyncio.run(start_app())