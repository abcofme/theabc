from datetime import datetime, timezone

from pytz import timezone as local_timezone
from sqlalchemy.dialects.postgresql import insert

from backend.database.models import AppOpening

APP_TIMEZONE = local_timezone("Europe/Moscow")


async def record_app_opening(session, user_id: int, opened_at: datetime):
    day = opened_at.replace(tzinfo=timezone.utc).astimezone(APP_TIMEZONE).date()
    await session.execute(
        insert(AppOpening).values(day=day, user_id=user_id, opened_at=opened_at).on_conflict_do_nothing()
    )
