from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()

from . import (
    app_mailings,
    mailing,
    diary_reminders,
    monitoring,
)
from .subscriptions import *
