from datetime import datetime

from sqlalchemy import select, Sequence

from backend.database.models import Mailing
from backend.database.patterns.dao import DataAccessObject


class MailingDAO:
    def __init__(self, dao: DataAccessObject):
        self.dao = dao

    async def get_mailings(self, was_notified: bool) -> Sequence[Mailing]:
        async with self.dao.session.begin():
            query = (
                select(Mailing)
                .where(
                    Mailing.was_notified == was_notified,
                    Mailing.scheduled_at < datetime.now()
                )
                .order_by(Mailing.scheduled_at)
            )
            results = await self.dao.session.execute(query)
            return results.scalars().all()
