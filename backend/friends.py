from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.bonuses import award
from backend.database.models import ContentLog, Friendship, User
from backend.password_auth import BROWSER_USER_ID

FRIEND_INVITE_PREFIX = "friend_"


def friend_invite_link(bot_link: str, user_id: int) -> str:
    return f"{bot_link}?start={FRIEND_INVITE_PREFIX}{user_id}"


def inviter_from_payload(payload: str | None) -> int | None:
    """id пригласившего из параметра ссылки-приглашения friend_<id>"""
    if not payload or not payload.startswith(FRIEND_INVITE_PREFIX):
        return None
    rest = payload[len(FRIEND_INVITE_PREFIX):]
    if rest == str(BROWSER_USER_ID):
        return BROWSER_USER_ID
    if not rest.isascii() or not rest.isdecimal() or len(rest) > 19:
        return None
    user_id = int(rest)
    return user_id if 0 < user_id < 2**63 else None


async def befriend(session: AsyncSession, user_id: int, inviter_id: int) -> bool:
    """Друг открыл личную ссылку — дружба сразу принята, пригласившему бонус. True, если она появилась только что"""
    if user_id == inviter_id or not await session.get(User, inviter_id):
        return False
    # Оба направления дружбы сериализуются в одном порядке.
    await session.execute(select(User.id).where(User.id.in_((user_id, inviter_id)))
                          .order_by(User.id).with_for_update(key_share=True))
    existing = (await session.execute(select(Friendship).where(or_(
        and_(Friendship.user_id == user_id, Friendship.friend_id == inviter_id),
        and_(Friendship.user_id == inviter_id, Friendship.friend_id == user_id),
    )).with_for_update())).scalars().first()
    if existing:
        if existing.status == "accepted":
            return False
        existing.status = "accepted"
    else:
        session.add(Friendship(user_id=inviter_id, friend_id=user_id, status="accepted"))
    session.add(ContentLog(user_id=inviter_id, kind="friendship"))
    await session.commit()
    await award(inviter_id, "friend_invited")
    return True
