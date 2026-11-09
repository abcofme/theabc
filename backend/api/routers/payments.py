from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, Security
from loguru import logger
from pydantic import BaseModel, UUID4
from redis.exceptions import RedisError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from yookassa.domain.exceptions import ForbiddenError

from backend.api.common import get_session
from backend.api.security import header_scheme, validate_twa_data
from backend.billing import disable_autorenew, handle_canceled_payment, settle_payment
from backend.database.models import Payment, User
from backend.integrations.payment.yoo import _check_payment, _create_payment
from backend.pricing import AUTORENEW_TERMS_VERSION, MAX_TOPUP, MIN_TOPUP, PREMIUM_PERIOD_DAYS, PREMIUM_PRICE, TOKENS_PER_RUBLE, tokens
from backend.redis_db import async_redis
from settings import settings

router = APIRouter()


async def _start_payment(auth_header: str, **kwargs):
    return_url = f"{settings.BOT_LINK.rstrip('/')}?startapp=billing" if auth_header.startswith("Bearer ") else None
    try:
        return await _create_payment(return_url=return_url, **kwargs)
    except ForbiddenError as e:
        logger.warning("YooKassa refused to create a payment for the configured shop")
        raise HTTPException(status_code=503, detail="Приём платежей через ЮKassa временно недоступен.") from e
    except Exception as e:
        logger.warning(f"YooKassa payment for {kwargs.get('chat_id')} not created: {type(e).__name__}")
        raise HTTPException(status_code=502, detail="Не удалось создать платеж. Попробуйте еще раз через минуту.") from e


async def _checkout_response(url: str, payment_id: str, checkout_id: UUID4 | None):
    if checkout_id:
        try:
            await async_redis.set(f"yoo-checkout:{checkout_id}", url, ex=120, nx=True)
        except RedisError:
            logger.warning("Could not publish YooKassa checkout URL to the browser")
    return {"url": url, "payment_id": payment_id}


@router.get("/api/payment/checkout/{checkout_id}")
async def checkout_link(checkout_id: UUID4, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return {"url": await async_redis.get(f"yoo-checkout:{checkout_id}")}


class AutoRenewConsent(BaseModel):
    terms_version: str
    amount: int
    period_days: int


class SubscriptionPurchase(BaseModel):
    autorenew: AutoRenewConsent | None = None


@router.post("/api/subscription/buy")
async def buy_subscription(
    req: SubscriptionPurchase | None = None,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session),
    auth_header: str = Security(header_scheme),
    checkout_id: UUID4 | None = None,
    method: Literal["sbp"] | None = None,
):
    user_id = user_data.get("id")
    user = await session.get(User, user_id)
    if settings.YOOKASSA_AUTORENEW and user and user.yookassa_payment_method_id and user.autorenew_consent_payment_id:
        raise HTTPException(status_code=409, detail="Перед новой покупкой Premium отключи текущее автопродление.")
    consent = req.autorenew if req else None
    if consent and (
        not settings.YOOKASSA_AUTORENEW
        or user_id <= 0
        or consent.terms_version != AUTORENEW_TERMS_VERSION
        or consent.amount != PREMIUM_PRICE
        or consent.period_days != PREMIUM_PERIOD_DAYS
    ):
        raise HTTPException(status_code=409, detail="Условия автопродления изменились. Обнови страницу перед оплатой.")
    if consent and method == "sbp":
        raise HTTPException(status_code=409, detail="Для автопродления оплати банковской картой. СБП доступна для разовой оплаты.")
    consent_at = datetime.utcnow() if consent else None

    url, payment_id = await _start_payment(
        auth_header,
        amount=PREMIUM_PRICE,
        chat_id=str(user_id),
        description=f"Premium «Азбука Я» ({PREMIUM_PERIOD_DAYS} дней)",
        save_payment_method=bool(consent),
        method="bank_card" if consent else method,
    )

    payment = Payment(
        user_id=user_id,
        uuid=payment_id,
        url=url,
        is_premium_subscription=True,
        is_recurring=False,
        amount=PREMIUM_PRICE,
        premium_period_days=PREMIUM_PERIOD_DAYS,
        autorenew_consent_at=consent_at,
        autorenew_terms_version=consent.terms_version if consent else None,
    )
    session.add(payment)
    await session.commit()

    return await _checkout_response(url, payment_id, checkout_id)


class TopUpRequest(BaseModel):
    amount: int


@router.post("/api/balance/topup")
async def buy_balance_topup(
    req: TopUpRequest,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session),
    auth_header: str = Security(header_scheme),
    checkout_id: UUID4 | None = None,
    method: Literal["sbp"] | None = None,
):
    if not MIN_TOPUP <= req.amount <= MAX_TOPUP:
        raise HTTPException(status_code=400, detail=f"Сумма пополнения — от {MIN_TOPUP} до {MAX_TOPUP} ₽")
    user_id = user_data.get("id")

    url, payment_id = await _start_payment(
        auth_header,
        amount=req.amount,
        chat_id=str(user_id),
        description=f"Пополнение баланса «Азбука Я»: {tokens(req.amount * TOKENS_PER_RUBLE)}",
        method=method,
    )

    session.add(Payment(user_id=user_id, uuid=payment_id, url=url, is_topup=True, amount=req.amount))
    await session.commit()

    return await _checkout_response(url, payment_id, checkout_id)


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
    if not payment:
        metadata = obj.get("metadata")
        renewal_key = metadata.get("renewal_key") if isinstance(metadata, dict) else None
        if isinstance(renewal_key, str):
            payment = await session.scalar(select(Payment).where(Payment.renewal_key == renewal_key))
    if not payment or payment.success:
        return {"status": "ok"}

    # Телу вебхука не доверяем: его может прислать кто угодно.
    # Статус, сумму и сохранённый способ оплаты берём из API ЮKassa
    try:
        info = await _check_payment(payment_uuid)
    except Exception as e:
        logger.warning(f"YooKassa check {payment_uuid} failed: {type(e).__name__}")
        raise HTTPException(status_code=500, detail="Payment check failed")

    if payment.renewal_key:
        if info.renewal_key != payment.renewal_key:
            return {"status": "ok"}
        if payment.uuid is None:
            # ЮKassa могла провести списание, даже если сервер потерял ответ на POST.
            await session.get(User, payment.user_id, with_for_update=True, populate_existing=True)
            await session.refresh(payment)
            if payment.uuid and payment.uuid != payment_uuid:
                return {"status": "ok"}
            payment.uuid = payment_uuid
            await session.commit()

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
    db_user = await session.get(User, user_id, with_for_update=True)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    disable_autorenew(db_user)
    await session.execute(update(Payment).where(
        Payment.user_id == user_id,
        Payment.renewal_key.is_not(None),
        Payment.renewal_started_at.is_(None),
        Payment.uuid.is_(None),
        Payment.renewal_canceled_at.is_(None),
    ).values(renewal_canceled_at=db_user.autorenew_disabled_at))
    await session.commit()
    return {"status": "success"}
