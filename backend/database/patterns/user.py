from sqlalchemy import select, func, case

from backend.database.models import User, Payment
from backend.database.patterns.dao import DataAccessObject


class UserDAO:
    def __init__(self, dao: DataAccessObject):
        self.dao = dao

    async def get_invited_id_counts(self) -> dict:
        subquery = (
            select(User.invited_id)
            .distinct()
        ).alias("subq")

        successful_payments_users = (
            select(Payment.user_id)
            .where(Payment.success == True)
            .distinct()
        ).subquery()

        query = (
            select(
                subquery.c.invited_id,
                func.count(User.id).label("total_users"),
                func.count(func.distinct(case((User.id.in_(successful_payments_users), User.id))))
                .label("users_with_successful_payments")
            )
            .select_from(subquery)
            .outerjoin(User, User.invited_id == subquery.c.invited_id)
            .group_by(subquery.c.invited_id)
        )
        results = await self.dao.session.execute(query)
        return {row.invited_id: (row.total_users, row.users_with_successful_payments) for row in results}

    async def get_user_invited_count(self, invited_id: str) -> int:
        query = (
            select(
                func.count(User.id).label("total_users")
            )
            .filter(User.invited_id == invited_id)
        )
        results = await self.dao.session.execute(query)
        return results.scalar()
