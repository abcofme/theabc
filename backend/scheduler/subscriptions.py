from datetime import datetime, timedelta

from apscheduler.triggers.interval import IntervalTrigger
from loguru import logger
from sqlalchemy import select

from backend.billing import settle_payment
from backend.database import async_session
from backend.database.models import Payment, User
from backend.integrations.payment.yoo import _check_payment, _create_recurring_payment
from backend.pricing import PREMIUM_PRICE
from backend.scheduler import scheduler
from settings import settings


@scheduler.scheduled_job(IntervalTrigger(hours=1))
async def process_recurring_subscriptions():
    """Автопродление Premium: за сутки до окончания списывает PREMIUM_PRICE сохранённым способом оплаты.
    Не прошло — пробует раз в сутки, пока подписка просрочена не больше чем на 3 дня"""
    if not settings.YOOKASSA_AUTORENEW:
        return
    now = datetime.utcnow()
    async with async_session() as session:
        user_ids = (await session.execute(select(User.id).where(
            User.premium_until != None,
            User.premium_until <= now + timedelta(hours=24),
            User.premium_until >= now - timedelta(days=3),
            User.yookassa_payment_method_id != None,
        ))).scalars().all()

    # Своя сессия на пользователя: сбой одного продления не задевает остальные
    for user_id in user_ids:
        try:
            async with async_session() as session:
                await _renew(session, await session.get(User, user_id), now)
        except Exception as e:
            logger.warning(f"Premium renewal for {user_id} failed: {e!r}")


async def _renew(session, user: User, now: datetime):
    if not user or not user.yookassa_payment_method_id or not user.premium_until or user.premium_until > now + timedelta(hours=24):
        return
    # Списание за последние сутки уже есть: ждём его итога, новое не создаём
    pending = (await session.execute(select(Payment).where(
        Payment.user_id == user.id,
        Payment.is_premium_subscription == True,
        Payment.is_recurring == True,
        Payment.success == False,
        Payment.created_at >= now - timedelta(hours=24),
    ))).scalars().first()
    if pending:
        info = await _check_payment(pending.uuid)
        if info.status == "succeeded":
            await settle_payment(session, pending, info)
        return

    status, payment_id = await _create_recurring_payment(
        amount=PREMIUM_PRICE,
        chat_id=str(user.id),
        description="Продление Premium подписки «Азбука Я»",
        payment_method_id=user.yookassa_payment_method_id,
    )
    # Сохраняем сразу: вебхук об этом платеже может прийти раньше, чем закончится обход
    payment = Payment(user_id=user.id, uuid=payment_id, is_premium_subscription=True, is_recurring=True, amount=PREMIUM_PRICE)
    session.add(payment)
    await session.commit()
    if status == "succeeded":
        await settle_payment(session, payment, await _check_payment(payment_id))
