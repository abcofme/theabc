import asyncio
import random
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

# Текст и кнопка напоминания: каждому пользователю случайный из списка
TEMPLATES = [
    (
        "<b>Как прошёл день?</b>\n\n"
        "<blockquote><b>Событие</b> — что произошло?\n"
        "<b>Реакция</b> — какие чувства возникли и что захотелось сделать?</blockquote>\n\n"
        "<i>Чем чаще ведёшь дневник, тем точнее отчёты.</i>",
        "Открыть дневник",
    ),
    (
        "<b>Что сегодня задело?</b>\n\n"
        "<blockquote>Что обрадовало, разозлило или удивило?</blockquote>\n\n"
        "<i>Вечером реакция помнится лучше, чем через неделю.</i>",
        "Записать",
    ),
    (
        "<b>Пара минут для себя</b>\n\n"
        "<blockquote>Достаточно <b>одного события</b> и твоей реакции на него.</blockquote>\n\n"
        "<i>Даже короткая запись идёт в счёт.</i>",
        "Сделать запись",
    ),
    (
        "<b>Ещё один кусочек портрета</b>\n\n"
        "Каждая запись показывает, насколько твоя реакция похожа на твой темперамент и характер.\n\n"
        "<i>Запиши сегодняшний день — и посмотри, что получится.</i>",
        "Открыть дневник",
    ),
    (
        "<b>Остановись на минуту</b>\n\n"
        "<blockquote>Что сегодня было важным? Какие чувства это вызвало и что захотелось сделать?</blockquote>\n\n"
        "<i>Замечать свои реакции — первый шаг к тому, чтобы понимать себя.</i>",
        "Записать день",
    ),
    (
        "<b>Сегодня реакция удивила?</b>\n\n"
        "Может, вышло спокойнее, чем обычно, — или наоборот, эмоции взяли верх. Запиши, пока помнишь.\n\n"
        "<i>Такие моменты лучше всего показывают характер.</i>",
        "Записать",
    ),
    (
        "<b>Отчётам нужны новые записи</b>\n\n"
        "Добавь сегодняшний день — и картина станет точнее.\n\n"
        "<i>Чем больше записей, тем больше в отчётах о тебе настоящего.</i>",
        "Открыть дневник",
    ),
    (
        "<b>Не теряй ритм</b>\n\n"
        "Ты уже ведёшь дневник — запись за сегодня продолжит серию.\n\n"
        "<i>Регулярность важнее длины.</i>",
        "Сделать запись",
    ),
    (
        "<b>Как ты сегодня?</b>\n\n"
        "<blockquote><b>Что случилось?</b>\nКакой была твоя реакция?</blockquote>\n\n"
        "<i>Даже обычный день что-то говорит о тебе.</i>",
        "Записать день",
    ),
    (
        "<b>День подходит к концу</b>\n\n"
        "<blockquote>Вспомни один момент — разговор, новость, мелочь — и свою реакцию на него.</blockquote>\n\n"
        "<i>Из таких моментов дневник собирает твой портрет.</i>",
        "Открыть дневник",
    ),
]


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
        text, button = random.choice(TEMPLATES)
        await notify(user_id, text, button=button)
        # Лимит Telegram — около 30 сообщений в секунду
        await asyncio.sleep(0.05)
