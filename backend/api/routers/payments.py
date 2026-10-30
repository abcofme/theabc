from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.common import get_session
from backend.api.security import validate_twa_data
from backend.billing import top_up
from backend.database.models import Payment, User
from backend.integrations.payment.yoo import _check_payment, _create_payment
from backend.pricing import MAX_TOPUP, MIN_TOPUP, PREMIUM_PRICE, TOKENS_PER_RUBLE, tokens

router = APIRouter()


def _extend_premium(user: User, payment_method_id: str | None):
    now = datetime.utcnow()
    if user.premium_until and user.premium_until > now:
        user.premium_until += timedelta(days=30)
    else:
        user.premium_until = now + timedelta(days=30)
    if payment_method_id:
        user.yookassa_payment_method_id = payment_method_id


async def _apply_payment(session: AsyncSession, payment: Payment, amount: float, payment_method_id: str | None):
    """Оплата подтверждена ЮKassa: продлеваем Premium или зачисляем пополнение на баланс"""
    payment.success = True
    user = await session.get(User, payment.user_id)
    if not user:
        return
    if payment.is_premium_subscription:
        _extend_premium(user, payment_method_id)
    elif payment.is_topup:
        # Зачисляем сумму, которую подтвердила ЮKassa, а не ту, что пришла с запросом
        await top_up(session, user.id, int(amount))
    else:
        # Платежи за бывший блок «Профориентация», начатые до его отмены
        user.has_career_access = True


@router.post("/api/subscription/buy")
async def buy_subscription(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")

    url, payment_id = await _create_payment(amount=PREMIUM_PRICE, chat_id=str(user_id), description="Premium подписка (1 месяц)", email="", save_payment_method=True)

    payment = Payment(
        user_id=user_id,
        uuid=payment_id,
        url=url,
        is_premium_subscription=True,
        is_recurring=False,
        amount=PREMIUM_PRICE,
    )
    session.add(payment)
    await session.commit()

    return {"url": url, "payment_id": payment_id}


class TopUpRequest(BaseModel):
    amount: int


@router.post("/api/balance/topup")
async def buy_balance_topup(
    req: TopUpRequest,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    if not MIN_TOPUP <= req.amount <= MAX_TOPUP:
        raise HTTPException(status_code=400, detail=f"Сумма пополнения — от {MIN_TOPUP} до {MAX_TOPUP} ₽")
    user_id = user_data.get("id")

    url, payment_id = await _create_payment(amount=req.amount, chat_id=str(user_id), description=f"Пополнение баланса «Азбука Я»: {tokens(req.amount * TOKENS_PER_RUBLE)}", email="", save_payment_method=False)

    session.add(Payment(user_id=user_id, uuid=payment_id, url=url, is_topup=True, amount=req.amount))
    await session.commit()

    return {"url": url, "payment_id": payment_id}


@router.get("/api/subscription/status/{payment_uuid}")
async def check_subscription_status(
    payment_uuid: str,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")

    payment = (await session.execute(select(Payment).where(Payment.uuid == payment_uuid, Payment.user_id == user_id))).scalars().first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    if payment.success:
        return {"status": "success"}

    meta, amount, payment_method_id = await _check_payment(payment_uuid)
    if meta is not False:  # succeeded
        await _apply_payment(session, payment, amount, payment_method_id)
        await session.commit()
        return {"status": "success"}

    return {"status": "pending"}


@router.post("/api/webhook/yookassa")
async def yookassa_webhook(request: Request, session: AsyncSession = Depends(get_session)):
    try:
        body = await request.json()
    except Exception:
        return {"status": "error"}

    event = body.get("event")
    if event == "payment.succeeded":
        payment_uuid = (body.get("object") or {}).get("id")
        if not payment_uuid:
            return {"status": "ok"}

        payment = (await session.execute(select(Payment).where(Payment.uuid == payment_uuid))).scalars().first()
        if not payment or payment.success:
            return {"status": "ok"}

        # Телу вебхука не доверяем: его может прислать кто угодно.
        # Статус, сумму и сохранённый способ оплаты берём из API ЮKassa.
        verified_metadata, amount_val, payment_method_id = await _check_payment(payment_uuid)
        if verified_metadata is False:
            return {"status": "ok"}

        await _apply_payment(session, payment, amount_val, payment_method_id)
        await session.commit()

    return {"status": "ok"}


@router.post("/api/subscription/cancel")
async def cancel_subscription(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    db_user = await session.get(User, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    db_user.yookassa_payment_method_id = None
    await session.commit()
    return {"status": "success"}
