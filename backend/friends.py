from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import Friendship, User

FRIEND_INVITE_PREFIX = "friend_"


def friend_invite_link(bot_link: str, user_id: int) -> str:
    return f"{bot_link}?start={FRIEND_INVITE_PREFIX}{user_id}"


def inviter_from_payload(payload: str | None) -> int | None:
    """id пригласившего из параметра ссылки-приглашения friend_<id>"""
    if not payload or not payload.startswith(FRIEND_INVITE_PREFIX):
        return None
    rest = payload[len(FRIEND_INVITE_PREFIX):]
    return int(rest) if rest.isdigit() else None


async def befriend(session: AsyncSession, user_id: int, inviter_id: int) -> bool:
    """Друг открыл личную ссылку — дружба сразу принята. True, если она появилась только что"""
    if user_id == inviter_id or not await session.get(User, inviter_id):
        return False
    existing = (await session.execute(select(Friendship).where(or_(
        and_(Friendship.user_id == user_id, Friendship.friend_id == inviter_id),
        and_(Friendship.user_id == inviter_id, Friendship.friend_id == user_id),
    )))).scalars().first()
    if existing:
        if existing.status == "accepted":
            return False
        existing.status = "accepted"
    else:
        session.add(Friendship(user_id=inviter_id, friend_id=user_id, status="accepted"))
    await session.commit()
    return True
