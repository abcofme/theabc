"""Публичные тарифы: без входа в Telegram и без обращения к базе данных."""

from fastapi import APIRouter

from backend.pricing import (
    AI_PRICES, DEMO_BALANCE, MAX_TOPUP, MIN_TOPUP,
    PREMIUM_PRICE, TOKENS_PER_RUBLE,
)

router = APIRouter()


@router.get("/api/public/prices")
async def public_prices():
    return {
        "premium": PREMIUM_PRICE,
        "premium_period_days": 30,
        "min_topup": MIN_TOPUP,
        "max_topup": MAX_TOPUP,
        "tokens_per_ruble": TOKENS_PER_RUBLE,
        "demo_balance": DEMO_BALANCE,
        **AI_PRICES,
    }
