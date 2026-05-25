from typing import Sequence

from sqlalchemy import and_, select

from backend.database.models import Result
from backend.database.patterns.dao import DataAccessObject, T


class ResultDAO:
    def __init__(self, dao: DataAccessObject):
        self.dao = dao

    async def get_by_points(self, test_id: int, points: int) -> Result:
        async with self.dao.session.begin():
            query = (
                select(Result)
                .where(
                    and_(
                        Result.test_id == test_id,
                        Result.range_from <= points,
                        Result.range_to > points,
                    )
                )
            )
            results = await self.dao.session.execute(query)
            return results.scalars().first()
