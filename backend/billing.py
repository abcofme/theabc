from datetime import datetime, timedelta

from fastapi import HTTPException
from loguru import logger
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import async_session
from backend.database.models import Payment, User
from backend.integrations.payment.yoo import PaymentInfo
from backend.pricing import AI_PRICES, PREMIUM_PERIOD_DAYS, TOKENS_PER_RUBLE, tokens

PREMIUM_PERIOD = timedelta(days=PREMIUM_PERIOD_DAYS)
# Отказы, после которых сохранённым способом больше не списать: автопродление выключаем
FINAL_CANCEL_REASONS = {"permission_revoked", "card_expired"}


def is_premium(user) -> bool:
    return bool(user and user.premium_until and user.premium_until > datetime.utcnow())


def can_use(user, feature: str) -> bool:
    """Хватит ли доступа на функцию с ИИ: Premium — без ограничений, иначе по балансу"""
    return is_premium(user) or bool(user and (user.balance or 0) >= AI_PRICES[feature])


async def charge(session: AsyncSession, user_id: int, feature: str) -> int:
    """Списывает цену функции в токенах с баланса до запуска ИИ. Возвращает списанные токены: 0 у Premium.
    Если ИИ не справится, их возвращает refund. Не хватает токенов — 402"""
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=403, detail="User not found")
    if is_premium(user):
        return 0
    price = AI_PRICES[feature]
    # Условие в самом UPDATE: два одновременных запроса не уведут баланс в минус
    result = await session.execute(
        update(User).where(User.id == user_id, User.balance >= price).values(balance=User.balance - price)
    )
    await session.commit()
    if result.rowcount == 0:
        raise HTTPException(
            status_code=402,
            detail=f"Недостаточно токенов на балансе: нужно {tokens(price)}. Пополните баланс или оформите Premium.",
        )
    return price


async def refund(user_id: int, amount: int):
    if not amount:
        return
    async with async_session() as session:
        await session.execute(update(User).where(User.id == user_id).values(balance=User.balance + amount))
        await session.commit()


async def top_up(session: AsyncSession, user_id: int, rubles: int):
    """Зачисляет оплаченное пополнение: рубли переводятся в токены по курсу TOKENS_PER_RUBLE"""
    amount = rubles * TOKENS_PER_RUBLE
    await session.execute(update(User).where(User.id == user_id).values(balance=User.balance + amount))


def disable_autorenew(user: User):
    user.yookassa_payment_method_id = None
    user.autorenew_consent_payment_id = None
    user.autorenew_disabled_at = datetime.utcnow()


async def _extend_premium(session: AsyncSession, user: User, payment: Payment, info: PaymentInfo):
    now = datetime.utcnow()
    period = timedelta(days=payment.premium_period_days) if payment.premium_period_days else PREMIUM_PERIOD
    user.premium_until = max(user.premium_until or now, now) + period
    if not payment.autorenew_consent_at or not info.payment_method_id:
        return
    if user.autorenew_disabled_at and payment.autorenew_consent_at <= user.autorenew_disabled_at:
        return
    if user.autorenew_consent_payment_id:
        previous = await session.get(Payment, user.autorenew_consent_payment_id)
        if previous and previous.autorenew_consent_at and previous.autorenew_consent_at >= payment.autorenew_consent_at:
            return
    user.yookassa_payment_method_id = info.payment_method_id
    user.autorenew_consent_payment_id = payment.id
    payment.autorenew_method_label = info.payment_method_label


async def settle_payment(session: AsyncSession, payment: Payment, info: PaymentInfo):
    """Оплата подтверждена ЮKassa: продлевает Premium или зачисляет пополнение на баланс и коммитит.
    Подтверждение приходит тремя путями — вебхук, проверка статуса из приложения, автопродление, —
    поэтому платёж сначала помечается оплаченным условным UPDATE: зачислит только первый"""
    if (
        info.status != "succeeded"
        or info.currency != "RUB"
        or not info.amount.is_finite()
        or info.amount <= 0
        or info.amount != info.amount.to_integral_value()
        or (payment.amount is not None and info.amount != payment.amount)
        or (payment.renewal_key is not None and info.renewal_key != payment.renewal_key)
    ):
        logger.error(f"YooKassa payment {payment.uuid} does not match the stored order")
        raise HTTPException(status_code=502, detail="Не удалось подтвердить параметры платежа.")
    rubles = int(info.amount)
    # Одинаковый порядок блокировок у продления, вебхука и отключения.
    user = await session.get(User, payment.user_id, with_for_update=payment.is_premium_subscription, populate_existing=True)
    claimed = await session.execute(
        update(Payment).where(Payment.id == payment.id, Payment.success.is_(False)).values(success=True)
    )
    if claimed.rowcount == 0:
        return
    if not user:
        await session.commit()
        return
    if payment.is_premium_subscription:
        await _extend_premium(session, user, payment, info)
    elif payment.is_topup:
        # Зачисляем сумму, которую подтвердила ЮKassa, а не ту, что пришла с запросом
        await top_up(session, user.id, rubles)
    else:
        # Платежи за бывший блок «Профориентация», начатые до его отмены
        user.has_career_access = True
    await session.commit()

    from backend.telegram.notify import notify
    if payment.is_premium_subscription:
        until = user.premium_until.strftime("%d.%m.%Y")
        title = "Подписка Premium продлена" if payment.is_recurring else "Premium подключён"
        await notify(user.id, f"💎 <b>{title}</b>\n\n"
                              f"Все возможности «Азбуки Я» — <b>без ограничений</b> до {until}.",
                     "page=billing", "💎 Открыть")
    elif payment.is_topup:
        await session.refresh(user)
        await notify(user.id, f"💳 <b>Баланс пополнен на {tokens(rubles * TOKENS_PER_RUBLE)}</b>\n\n"
                              f"Сейчас на балансе <b>{tokens(user.balance)}</b>.",
                     "page=billing", "💳 Открыть")


async def handle_canceled_payment(session: AsyncSession, payment: Payment, info: PaymentInfo):
    """Неудачное автопродление: сообщаем пользователю, а если способ оплаты больше не работает — забываем его"""
    if not (payment.is_premium_subscription and payment.is_recurring and payment.renewal_key == info.renewal_key):
        return
    user = await session.get(User, payment.user_id, with_for_update=True, populate_existing=True)
    if not user:
        return
    await session.refresh(payment)
    if payment.success or payment.renewal_canceled_at:
        return
    payment.renewal_canceled_at = datetime.utcnow()
    current = (
        user.yookassa_payment_method_id
        and user.yookassa_payment_method_id == payment.renewal_method_id
        and user.premium_until == payment.renewal_due_at
    )
    final = info.cancel_reason in FINAL_CANCEL_REASONS
    if current and final:
        disable_autorenew(user)
    await session.commit()
    if not current:
        return

    from backend.telegram.notify import notify
    hint = ("Автопродление выключено: сохранённым способом больше не оплатить. Оформи Premium заново, "
            "когда будет удобно." if final else "Если хочешь оплатить вручную, сначала отключи автопродление в разделе подписки.")
    await notify(user.id, f"⚠️ <b>Не удалось продлить Premium</b>\n\n{hint}", "page=billing", "💎 Открыть")
