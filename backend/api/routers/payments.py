from fastapi import APIRouter, Depends, HTTPException, Request, Security
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from yookassa.domain.exceptions import ForbiddenError

from backend.api.common import get_session
from backend.api.security import header_scheme, validate_twa_data
from backend.billing import handle_canceled_payment, settle_payment
from backend.database.models import Payment, User
from backend.integrations.payment.yoo import _check_payment, _create_payment
from backend.pricing import MAX_TOPUP, MIN_TOPUP, PREMIUM_PRICE, TOKENS_PER_RUBLE, tokens
from settings import settings

router = APIRouter()


async def checkout_user(
    user_data: dict = Depends(validate_twa_data),
    auth_header: str = Security(header_scheme),
) -> dict:
    if not auth_header.startswith("Session "):
        raise HTTPException(status_code=403, detail="Оплата через ЮKassa доступна на сайте.")
    return user_data


async def _start_payment(**kwargs):
    try:
        return await _create_payment(**kwargs)
    except ForbiddenError as e:
        logger.warning("YooKassa refused to create a payment for the configured shop")
        raise HTTPException(status_code=503, detail="Приём платежей через ЮKassa временно недоступен.") from e
    except Exception as e:
        logger.warning(f"YooKassa payment for {kwargs.get('chat_id')} not created: {type(e).__name__}")
        raise HTTPException(status_code=502, detail="Не удалось создать платеж. Попробуйте еще раз через минуту.") from e


@router.post("/api/subscription/buy")
async def buy_subscription(
    user_data: dict = Depends(checkout_user),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")

    url, payment_id = await _start_payment(
        amount=PREMIUM_PRICE,
        chat_id=str(user_id),
        description="Premium «Азбука Я» (30 дней)",
        save_payment_method=settings.YOOKASSA_AUTORENEW,
    )

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
    user_data: dict = Depends(checkout_user),
    session: AsyncSession = Depends(get_session)
):
    if not MIN_TOPUP <= req.amount <= MAX_TOPUP:
        raise HTTPException(status_code=400, detail=f"Сумма пополнения — от {MIN_TOPUP} до {MAX_TOPUP} ₽")
    user_id = user_data.get("id")

    url, payment_id = await _start_payment(amount=req.amount, chat_id=str(user_id), description=f"Пополнение баланса «Азбука Я»: {tokens(req.amount * TOKENS_PER_RUBLE)}")

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

    try:
        info = await _check_payment(payment_uuid)
    except Exception as e:
        logger.warning(f"YooKassa check {payment_uuid} failed: {type(e).__name__}")
        raise HTTPException(status_code=502, detail="Не удалось проверить платёж.") from e
    if info.status == "succeeded":
        await settle_payment(session, payment, info)
        return {"status": "success"}
    if info.status == "canceled":
        return {"status": "canceled"}
    return {"status": "pending"}


@router.post("/api/webhook/yookassa")
async def yookassa_webhook(request: Request, session: AsyncSession = Depends(get_session)):
    """HTTP-уведомления ЮKassa (кабинет → Интеграция → HTTP-уведомления, события payment.succeeded и payment.canceled).
    Отвечаем 200 всегда, кроме сбоя API ЮKassa: тогда 500, и ЮKassa повторит уведомление"""
    try:
        body = await request.json()
    except Exception:
        return {"status": "ok"}

    if not isinstance(body, dict):
        return {"status": "ok"}
    event = body.get("event")
    obj = body.get("object")
    payment_uuid = obj.get("id") if isinstance(obj, dict) else None
    if event not in ("payment.succeeded", "payment.canceled") or not isinstance(payment_uuid, str) or not payment_uuid:
        return {"status": "ok"}

    payment = (await session.execute(select(Payment).where(Payment.uuid == payment_uuid))).scalars().first()
    if not payment or payment.success:
        return {"status": "ok"}

    # Телу вебхука не доверяем: его может прислать кто угодно.
    # Статус, сумму и сохранённый способ оплаты берём из API ЮKassa
    try:
        info = await _check_payment(payment_uuid)
    except Exception as e:
        logger.warning(f"YooKassa check {payment_uuid} failed: {type(e).__name__}")
        raise HTTPException(status_code=500, detail="Payment check failed")

    if info.status == "succeeded":
        await settle_payment(session, payment, info)
    elif info.status == "canceled" and event == "payment.canceled":
        await handle_canceled_payment(session, payment, info)
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
