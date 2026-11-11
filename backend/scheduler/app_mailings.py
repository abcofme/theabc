import asyncio
from datetime import datetime, timedelta, timezone

from aiogram.exceptions import TelegramAPIError, TelegramNetworkError, TelegramRetryAfter, TelegramServerError
from apscheduler.triggers.interval import IntervalTrigger
from loguru import logger
from sqlalchemy import select, update

from backend.database import async_session
from backend.database.models import AppMailing, AppMailingRecipient
from backend.scheduler import scheduler
from backend.telegram.bot import bot

BATCH_SIZE = 25
REQUEST_TIMEOUT = 20
ABANDONED_AFTER = timedelta(minutes=5)


async def deliver_message(user_id: int, text: str) -> str:
    try:
        async with asyncio.timeout(REQUEST_TIMEOUT):
            try:
                await bot.send_message(user_id, text, parse_mode=None, disable_web_page_preview=True)
            except TelegramRetryAfter as error:
                if error.retry_after >= REQUEST_TIMEOUT:
                    return "failed"
                await asyncio.sleep(error.retry_after)
                await bot.send_message(user_id, text, parse_mode=None, disable_web_page_preview=True)
        return "sent"
    except (TimeoutError, TelegramNetworkError, TelegramServerError):
        # Telegram мог принять запрос до разрыва соединения.
        return "unconfirmed"
    except TelegramAPIError:
        return "failed"
    except Exception as error:
        logger.warning(f"App mailing delivery failed: {type(error).__name__}")
        return "unconfirmed"


@scheduler.scheduled_job(IntervalTrigger(seconds=15))
async def process_app_mailings():
    async with async_session() as session:
        now = datetime.now(timezone.utc)
        await session.execute(update(AppMailingRecipient).where(
            AppMailingRecipient.status == "sending",
            AppMailingRecipient.started_at < now - ABANDONED_AFTER,
        ).values(status="unconfirmed"))
        await session.commit()

        while True:
            batch = (await session.execute(
                select(AppMailingRecipient, AppMailing.text)
                .join(AppMailing)
                .where(AppMailingRecipient.status == "pending")
                .order_by(AppMailing.created_at, AppMailing.id, AppMailingRecipient.user_id)
                .limit(BATCH_SIZE)
                .with_for_update(of=AppMailingRecipient, skip_locked=True)
            )).all()
            if not batch:
                return

            # Фиксируем попытку до вызова Telegram. После остановки процесса такую отправку не повторяем.
            started_at = datetime.now(timezone.utc)
            for recipient, _ in batch:
                recipient.status = "sending"
                recipient.started_at = started_at
            await session.commit()

            statuses = await asyncio.gather(*(deliver_message(recipient.user_id, text) for recipient, text in batch))
            for (recipient, _), status in zip(batch, statuses, strict=True):
                recipient.status = status
            await session.commit()
