import asyncio
import sys

import uvicorn
from loguru import logger

from backend.logs.logs import configure_logger

configure_logger()


async def run_migrations():
    from backend.database import engine
    from backend.database.base import Base
    from backend.database.connect import create_all_tables
    from migrate import run_async_upgrade

    await create_all_tables(engine, Base.metadata)
    await run_async_upgrade()

    try:
        from backend.migrate import migrate
        await migrate()
    except Exception as e:
        logger.error(f"Failed to run backend migrations: {e}")


async def run_bot():
    from backend.scheduler import scheduler
    from backend.telegram.bot import dp, bot
    from backend.telegram.middlewares import register_middlewares

    register_middlewares(bot)

    from backend.telegram import handlers  # NOQA

    await bot.delete_webhook()
    # Планировщик живёт только в процессе бота: рассылки и продления подписок шлются через него
    scheduler.start()

    logger.info("-> Bot online")
    await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())


async def run_api():
    from backend.api.main import app as fastapi_app

    config = uvicorn.Config(
        app=fastapi_app,
        host="0.0.0.0",
        port=8000,
        loop="asyncio",
        # API стоит за Caddy: берём реальный IP клиента из X-Forwarded-For
        proxy_headers=True,
        forwarded_allow_ips="*",
        server_header=False,
    )
    await uvicorn.Server(config).serve()


async def run_all():
    await run_migrations()
    await asyncio.gather(run_api(), run_bot())


# python run.py [migrate|api|bot|all] — в продакшене каждый режим запускается отдельным контейнером
MODES = {
    "migrate": run_migrations,
    "api": run_api,
    "bot": run_bot,
    "all": run_all,
}

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    if mode not in MODES:
        sys.exit(f"Unknown mode: {mode}. Use one of: {', '.join(MODES)}")
    asyncio.run(MODES[mode]())
