import asyncio
from datetime import datetime, timedelta

from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from backend.database import async_session
from backend.database.models import DiaryEntry, User
from backend.scheduler import scheduler
from backend.telegram.notify import notify

# Напоминаем тем, кто ведёт дневник: писал за последние две недели, но не сегодня
ACTIVE_DAYS = 14
# Москва без перехода на летнее время — UTC+3
MOSCOW_OFFSET = timedelta(hours=3)


@scheduler.scheduled_job(CronTrigger(hour=20, minute=0, timezone="Europe/Moscow"))
async def diary_reminders():
    today = (datetime.utcnow() + MOSCOW_OFFSET).date()
    async with async_session() as session:
        active = select(DiaryEntry.user_id).where(DiaryEntry.date >= today - timedelta(days=ACTIVE_DAYS))
        wrote_today = select(DiaryEntry.user_id).where(DiaryEntry.date == today)
        user_ids = (await session.execute(
            select(User.id).where(
                User.id.in_(active),
                User.id.not_in(wrote_today),
                User.diary_reminders.is_(True),
                User.banned.is_not(True),
            )
        )).scalars().all()

    for user_id in user_ids:
        await notify(
            user_id,
            "Как прошёл день? Запиши, что произошло и как ты отреагировал(а). Чем чаще ведёшь дневник, тем точнее отчеты.",
            button="Открыть дневник",
        )
        # Лимит Telegram — около 30 сообщений в секунду
        await asyncio.sleep(0.05)
