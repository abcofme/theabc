from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()

from . import (
    mailing,
    diary_reminders,
)
from .subscriptions import *
