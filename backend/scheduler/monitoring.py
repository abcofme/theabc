from apscheduler.triggers.interval import IntervalTrigger

from backend.performance import sample
from backend.scheduler import scheduler


# Ресурсы сервера и сервиса распознавания — в историю для отчета, превышение порогов — алерт админам
@scheduler.scheduled_job(IntervalTrigger(minutes=1), max_instances=1, coalesce=True)
async def sample_resources():
    await sample()
