import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from apscheduler.triggers.interval import IntervalTrigger
from loguru import logger
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.billing import handle_canceled_payment, settle_payment
from backend.database import async_session
from backend.database.models import Payment, User
from backend.integrations.payment.yoo import _check_payment, _create_recurring_payment
from backend.scheduler import scheduler
from settings import settings

REMINDER_LEAD = timedelta(hours=24)
RETRY_DELAY = timedelta(days=1)
RENEWAL_GRACE = timedelta(days=3)
# ЮKassa хранит ключ 24 часа. Оставляем запас на передачу запроса.
SAFE_REPLAY_WINDOW = timedelta(hours=23, minutes=55)


def _open_renewals():
    return select(Payment).where(
        Payment.is_recurring.is_(True),
        Payment.success.is_(False),
        Payment.renewal_canceled_at.is_(None),
    )


@scheduler.scheduled_job(IntervalTrigger(hours=1))
async def process_recurring_subscriptions():
    if not settings.YOOKASSA_AUTORENEW:
        return
    now = datetime.utcnow()
    async with async_session() as session:
        known_payments = (await session.scalars(
            _open_renewals().with_only_columns(Payment.id).where(Payment.uuid.is_not(None))
        )).all()
        user_ids = (await session.scalars(select(User.id).where(
            User.id > 0,
            User.premium_until <= now + REMINDER_LEAD + timedelta(hours=1),
            User.premium_until >= now - RENEWAL_GRACE,
            User.yookassa_payment_method_id.is_not(None),
            User.autorenew_consent_payment_id.is_not(None),
        ))).all()

    for payment_id in known_payments:
        try:
            async with async_session() as session:
                await _reconcile(session, await session.get(Payment, payment_id))
        except Exception as exc:
            logger.warning(f"Could not reconcile Premium renewal {payment_id}: {type(exc).__name__}")
    for user_id in user_ids:
        try:
            async with async_session() as session:
                attempt_id = await _prepare_renewal(session, user_id, datetime.utcnow())
                if attempt_id is not None:
                    await _submit_renewal(session, attempt_id)
        except Exception as exc:
            logger.warning(f"Premium renewal for {user_id} failed: {type(exc).__name__}")


async def _reconcile(session: AsyncSession, payment: Payment):
    if not payment or payment.success or payment.renewal_canceled_at:
        return
    info = await _check_payment(payment.uuid)
    if info.status == "succeeded":
        await settle_payment(session, payment, info)
    elif info.status == "canceled":
        await handle_canceled_payment(session, payment, info)


async def _remind(session: AsyncSession, user: User, amount: int, now: datetime):
    from backend.telegram.notify import notify

    first_charge = max(user.premium_until, now + REMINDER_LEAD)
    if first_charge > user.premium_until + RENEWAL_GRACE:
        return
    when = first_charge.replace(tzinfo=timezone.utc).astimezone(ZoneInfo("Europe/Moscow"))
    async with asyncio.timeout(15):
        sent = await notify(
            user.id,
            "<b>Premium продлится автоматически</b>\n\n"
            f"<blockquote>Сумма — <b>{amount} ₽</b>\n"
            f"Ожидаемое списание — <b>{when:%d.%m.%Y в %H:%M} МСК</b></blockquote>\n\n"
            "Отключить автопродление можно в разделе подписки.",
            "page=billing",
            "Открыть подписку",
        )
    if sent:
        user.autorenew_reminded_for = user.premium_until
        user.autorenew_reminded_at = datetime.utcnow()
        await session.commit()


async def _prepare_renewal(session: AsyncSession, user_id: int, now: datetime) -> int | None:
    user = await session.get(User, user_id, with_for_update=True, populate_existing=True)
    if not user or not user.yookassa_payment_method_id or not user.autorenew_consent_payment_id or not user.premium_until:
        return None
    due = user.premium_until
    if not now - RENEWAL_GRACE <= due <= now + REMINDER_LEAD + timedelta(hours=1):
        return None
    consent = await session.get(Payment, user.autorenew_consent_payment_id)
    if not consent or consent.user_id != user.id or not consent.success or not consent.autorenew_consent_at or not consent.amount or not consent.premium_period_days:
        return None

    pending = (await session.scalars(_open_renewals().where(
        Payment.user_id == user.id,
        or_(Payment.uuid.is_not(None), Payment.renewal_started_at.is_not(None), Payment.renewal_due_at == due),
    ).order_by(Payment.created_at))).first()
    if pending:
        # Незавершённое списание из любого периода блокирует новый платёж.
        if pending.uuid is None and pending.renewal_due_at == due:
            if pending.renewal_started_at and now >= pending.renewal_started_at + SAFE_REPLAY_WINDOW:
                logger.error(f"Premium renewal {pending.id} needs reconciliation in YooKassa")
                return None
            return pending.id
        return None

    if user.autorenew_reminded_for != due or not user.autorenew_reminded_at:
        await _remind(session, user, consent.amount, now)
        return None
    if now < max(due, user.autorenew_reminded_at + REMINDER_LEAD):
        return None

    last_cancellation = await session.scalar(select(Payment.renewal_canceled_at).where(
        Payment.user_id == user.id,
        Payment.renewal_due_at == due,
        Payment.renewal_canceled_at.is_not(None),
    ).order_by(Payment.renewal_canceled_at.desc()).limit(1))
    if last_cancellation and now < last_cancellation + RETRY_DELAY:
        return None

    attempt = Payment(
        user_id=user.id,
        is_premium_subscription=True,
        is_recurring=True,
        amount=consent.amount,
        premium_period_days=consent.premium_period_days,
        renewal_due_at=due,
        renewal_key=str(uuid4()),
        renewal_method_id=user.yookassa_payment_method_id,
    )
    session.add(attempt)
    await session.commit()
    return attempt.id


async def _can_submit(session: AsyncSession, attempt: Payment) -> bool:
    # Отключение использует ту же блокировку. После принятого отказа запрос уже не отправится.
    user = await session.get(User, attempt.user_id, with_for_update=True, populate_existing=True)
    await session.refresh(attempt)
    now = datetime.utcnow()
    return bool(
        user
        and user.autorenew_consent_payment_id
        and user.yookassa_payment_method_id
        and user.yookassa_payment_method_id == attempt.renewal_method_id
        and user.premium_until == attempt.renewal_due_at
        and attempt.renewal_due_at
        and attempt.renewal_due_at <= now <= attempt.renewal_due_at + RENEWAL_GRACE
        and not attempt.uuid
        and not attempt.success
        and not attempt.renewal_canceled_at
        and attempt.renewal_key
        and (not attempt.renewal_started_at or now < attempt.renewal_started_at + SAFE_REPLAY_WINDOW)
    )


async def _submit_renewal(session: AsyncSession, attempt_id: int):
    attempt = await session.get(Payment, attempt_id)
    if not attempt or not await _can_submit(session, attempt):
        return
    if not attempt.renewal_started_at:
        attempt.renewal_started_at = datetime.utcnow()
        await session.commit()
        if not await _can_submit(session, attempt):
            return
    attempt.uuid = await _create_recurring_payment(
        amount=attempt.amount,
        chat_id=str(attempt.user_id),
        description="Продление Premium подписки «Азбука Я»",
        payment_method_id=attempt.renewal_method_id,
        renewal_key=attempt.renewal_key,
    )
    await session.commit()
    await _reconcile(session, attempt)
