from datetime import datetime, timedelta

from fastapi import HTTPException
from loguru import logger
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import async_session
from backend.database.models import Payment, User
from backend.integrations.payment.yoo import PaymentInfo
from backend.pricing import AI_PRICES, TOKENS_PER_RUBLE, tokens

PREMIUM_PERIOD = timedelta(days=30)
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


def _extend_premium(user: User, payment_method_id: str | None):
    now = datetime.utcnow()
    user.premium_until = max(user.premium_until or now, now) + PREMIUM_PERIOD
    if payment_method_id:
        user.yookassa_payment_method_id = payment_method_id


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
    ):
        logger.error(f"YooKassa payment {payment.uuid} does not match the stored order")
        raise HTTPException(status_code=502, detail="Не удалось подтвердить параметры платежа.")
    rubles = int(info.amount)
    claimed = await session.execute(
        update(Payment).where(Payment.id == payment.id, Payment.success.is_(False)).values(success=True)
    )
    if claimed.rowcount == 0:
        return
    user = await session.get(User, payment.user_id, with_for_update=payment.is_premium_subscription, populate_existing=True)
    if not user:
        await session.commit()
        return
    if payment.is_premium_subscription:
        _extend_premium(user, info.payment_method_id if not payment.is_recurring else None)
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
    if not (payment.is_premium_subscription and payment.is_recurring):
        return
    user = await session.get(User, payment.user_id)
    if not user:
        return
    final = info.cancel_reason in FINAL_CANCEL_REASONS
    if final:
        user.yookassa_payment_method_id = None
        await session.commit()

    from backend.telegram.notify import notify
    hint = ("Автопродление выключено: сохранённым способом больше не оплатить. Оформи Premium заново, "
            "когда будет удобно." if final else "Попробуем ещё раз через сутки. Можно оплатить и вручную.")
    await notify(user.id, f"⚠️ <b>Не удалось продлить Premium</b>\n\n{hint}", "page=billing", "💎 Открыть")
