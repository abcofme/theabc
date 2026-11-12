import re
from datetime import datetime, timedelta, timezone
from hashlib import md5
from secrets import token_urlsafe

from fastapi import HTTPException
from sqlalchemy import func, select

from backend.app_activity import APP_TIMEZONE
from backend.database.models import (
    PartnerAccount, PartnerEarning, PartnerWithdrawal, Payment, ReferralAttribution, TrackingLink, User,
)
from backend.friends import inviter_from_payload
from settings import settings

MIN_WITHDRAWAL = 1_000
COMMISSION_KOPECKS_PER_RUBLE = 50
PARTNER_PREFIX = "partner_"
CAMPAIGN_PREFIX = "tr_"
LINK_CODE = re.compile(r"[A-Za-z0-9_-]{1,56}")


def link_url(code, *, partner):
    prefix = PARTNER_PREFIX if partner else CAMPAIGN_PREFIX
    return f"{settings.BOT_LINK}?start={prefix}{code}"


def link_data(link):
    return {"id": link.id, "name": link.name, "url": link_url(link.code, partner=link.partner_id is not None)}


def new_partner_link(user_id, name):
    return TrackingLink(name=name, code=token_urlsafe(12), partner_id=user_id)


async def require_partner(session, user_id, *, lock=False):
    account = await session.get(PartnerAccount, user_id, with_for_update=lock, populate_existing=lock)
    user = await session.get(User, user_id)
    if not account or not account.enabled or not user or user.banned:
        raise HTTPException(403, "Партнёрский доступ выдаёт администратор")
    return account


async def capture_referral(session, user, payload, *, now):
    """Первый подтверждённый источник до открытия приложения. Другие ссылки по-прежнему могут добавить друга."""
    if not payload or user.has_opened_app or await session.scalar(
        select(ReferralAttribution.id).where(ReferralAttribution.user_id == user.id)
    ):
        return
    if await session.scalar(select(Payment.id).where(Payment.user_id == user.id, Payment.success.is_(True)).limit(1)):
        return

    inviter_id = inviter_from_payload(payload)
    if payload.startswith("invite_"):
        suffix = payload.removeprefix("invite_")
        if suffix.isascii() and suffix.isdecimal() and len(suffix) < 19:
            inviter_id = int(suffix)

    partner_id = source_id = None
    if inviter_id is not None:
        inviter = await session.get(User, inviter_id) if -(2**63) <= inviter_id < 2**63 else None
        if not inviter or inviter.banned or inviter.id == user.id or inviter.created_at >= user.created_at:
            return
        parent = await session.scalar(select(ReferralAttribution).where(ReferralAttribution.user_id == inviter_id))
        if parent:
            partner_id, source_id = parent.partner_id, parent.source_id
        elif payload.startswith("invite_"):
            # Старые персональные ссылки партнёров действуют после выдачи доступа.
            account = await session.get(PartnerAccount, inviter_id)
            if account and account.enabled:
                partner_id = inviter_id
        kind = "legacy" if payload.startswith("invite_") else "friend"
        if not user.invited_id:
            user.invited_id = str(inviter_id)
    else:
        prefix = next((p for p in (PARTNER_PREFIX, CAMPAIGN_PREFIX, "invite_") if payload.startswith(p)), None)
        if not prefix or not LINK_CODE.fullmatch(code := payload.removeprefix(prefix)):
            return
        if prefix == "invite_":
            # Ранее админы создавали ссылки invite_<произвольный код> прямо в боте.
            key = "legacy_" + md5(code.encode("utf-8")).hexdigest()
            link = await session.scalar(select(TrackingLink).where(
                TrackingLink.code == key, TrackingLink.archived.is_(False)
            ))
        else:
            link = await session.scalar(select(TrackingLink).where(
                TrackingLink.code == code, TrackingLink.archived.is_(False)
            ))
        if not link or (prefix == PARTNER_PREFIX) != (link.partner_id is not None):
            return
        if link.partner_id is not None:
            owner = await session.get(User, link.partner_id)
            account = await session.get(PartnerAccount, link.partner_id)
            if not owner or owner.banned or not account or not account.enabled or owner.created_at >= user.created_at:
                return
            inviter_id = partner_id = owner.id
            kind = "partner"
        else:
            user.tracking_link_id = link.id
            if prefix == "invite_" and not user.invited_id:
                user.invited_id = code
            kind = "campaign"
        source_id = link.id

    session.add(ReferralAttribution(
        user_id=user.id, inviter_id=inviter_id, partner_id=partner_id,
        source_id=source_id, kind=kind, created_at=now,
    ))


def commission_release(paid_at):
    local_day = paid_at.replace(tzinfo=timezone.utc).astimezone(APP_TIMEZONE).date()
    first_next = (local_day.replace(day=28) + timedelta(days=4)).replace(day=1)
    return APP_TIMEZONE.localize(datetime.combine(first_next, datetime.min.time())).astimezone(timezone.utc).replace(tzinfo=None)


async def accrue_commission(session, payment, rubles, paid_at):
    partner_id = await session.scalar(select(ReferralAttribution.partner_id).where(
        ReferralAttribution.user_id == payment.user_id, ReferralAttribution.created_at <= paid_at,
    ))
    if partner_id is not None:
        session.add(PartnerEarning(
            partner_id=partner_id, payment_id=payment.id, amount_kopecks=rubles * COMMISSION_KOPECKS_PER_RUBLE,
            created_at=paid_at, available_at=commission_release(paid_at),
        ))


async def partner_balance(session, user_id):
    now = datetime.utcnow()
    earnings = PartnerEarning.amount_kopecks
    earned, locked = (await session.execute(select(
        func.coalesce(func.sum(earnings), 0),
        func.coalesce(func.sum(earnings).filter(PartnerEarning.available_at > now), 0),
    ).where(PartnerEarning.partner_id == user_id))).one()
    amount = PartnerWithdrawal.amount_kopecks
    pending, paid = (await session.execute(select(
        func.coalesce(func.sum(amount).filter(PartnerWithdrawal.status == "pending"), 0),
        func.coalesce(func.sum(amount).filter(PartnerWithdrawal.status == "paid"), 0),
    ).where(PartnerWithdrawal.partner_id == user_id))).one()
    return {"earned": earned, "locked": locked, "available": earned - locked - pending - paid,
            "reserved": pending, "paid": paid, "minimum": MIN_WITHDRAWAL}
