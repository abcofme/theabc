from sqlalchemy import Sequence
from sqlalchemy.orm import joinedload

from backend.database.models import Progress
from backend.database.patterns.dao import DataAccessObject


class ProgressDAO:
    def __init__(self, dao: DataAccessObject):
        self.dao = dao

    async def get_from_user(self, user_id: int) -> Sequence[Progress]:
        return await self.dao.filter(
            Progress, dict(user_id=user_id), options=[joinedload(Progress.test)]
        )
