from datetime import datetime

from sqlalchemy import update

from backend.database.models import TokenMovement


def credit_tokens(session, user_id, amount, kind):
    session.add(TokenMovement(user_id=user_id, kind=kind, amount=amount))


async def complete_charge(session, charge_id, *, feature=None):
    if charge_id is None:
        return
    values = {"completed_at": datetime.utcnow()}
    if feature:
        values["feature"] = feature
    result = await session.execute(update(TokenMovement).where(
        TokenMovement.id == charge_id, TokenMovement.refunded_at.is_(None), TokenMovement.completed_at.is_(None),
    ).values(**values))
    if not result.rowcount:
        raise RuntimeError("Token charge was already settled")
