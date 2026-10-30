from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import async_session
from backend.database.models import User
from backend.pricing import AI_PRICES, TOKENS_PER_RUBLE, tokens


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
