"""Бонусы за первые шаги: токены на баланс один раз за каждый вид (суммы — backend/pricing.py, BONUSES).
Начисляет award там, где шаг сделан; приложение получает список в /api/profile и показывает новые"""
from loguru import logger
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import async_session
from backend.database.models import Bonus, Category, Progress, Test, User
from backend.pricing import BONUSES

# Задание на странице бонусов и за что начислено — в сообщении о бонусе.
# Порядок — путь по приложению: в нем бонусы и показываются
BONUS_TEXTS = {
    "first_test": ("Пройти первый тест", "за первый пройденный тест"),
    "all_tests": ("Пройти все тесты для портрета", "за все тесты для портрета"),
    "portrait": ("Сформировать портрет личности", "за портрет личности"),
    "diary_answer": ("Получить ответ дневника на запись", "за первый ответ дневника"),
    "diary_week": ("Вести дневник 7 дней подряд", "за 7 дней дневника подряд"),
    "report_repeating_events": ("Отчет «Повторяющиеся события»", "за первый отчет «Повторяющиеся события»"),
    "report_effective_reactions": ("Отчет «Мои реакции»", "за первый отчет «Мои реакции»"),
    "report_energy": ("Отчет «Энергия»", "за первый отчет «Энергия»"),
    "report_competence": ("Отчет «Чувство компетентности»", "за первый отчет «Чувство компетентности»"),
    "friend_invited": ("Пригласить друга по своей ссылке", "за друга по твоей ссылке"),
    "compatibility": ("Узнать совместимость с другом", "за первый анализ совместимости"),
    "install_app": ("Установить приложение на главный экран", "за приложение на главном экране"),
}


async def award(user_id: int, kind: str) -> int:
    """Начисляет бонус, если его еще не было. Возвращает начисленные токены, 0 — если бонус уже получен.
    Сбой не мешает самому действию: бонус только пропадает, поэтому ошибки здесь не выходят наружу"""
    amount = BONUSES[kind]
    try:
        async with async_session() as session:
            # Вставка и начисление в одной транзакции: два одновременных запроса не начислят дважды
            inserted = await session.execute(
                insert(Bonus).values(user_id=user_id, kind=kind, amount=amount)
                .on_conflict_do_nothing(constraint="uq_bonuses_user_kind")
                .returning(Bonus.id)
            )
            if inserted.first() is None:
                return 0
            await session.execute(update(User).where(User.id == user_id).values(balance=User.balance + amount))
            await session.commit()
    except Exception:
        logger.exception(f"Bonus {kind} for {user_id} failed")
        return 0
    return amount


async def bonus_list(session: AsyncSession, user_id: int) -> list[dict]:
    """Все бонусы для приложения: что за шаг, сколько за него, сделан ли и показано ли уже сообщение"""
    got = {b.kind: b for b in (await session.execute(select(Bonus).where(Bonus.user_id == user_id))).scalars()}
    return [{
        "kind": kind,
        "title": title,
        "reason": reason,
        "amount": got[kind].amount if kind in got else BONUSES[kind],
        "done": kind in got,
        "new": kind in got and not got[kind].seen,
    } for kind, (title, reason) in BONUS_TEXTS.items()]


async def mark_seen(session: AsyncSession, user_id: int, kinds: list[str]):
    await session.execute(
        update(Bonus).where(Bonus.user_id == user_id, Bonus.kind.in_(kinds)).values(seen=True)
    )
    await session.commit()


async def passed_all_portrait_tests(session: AsyncSession, user_id: int) -> bool:
    """Пройдены все тесты для портрета — все, кроме профориентации (как считает /api/profile)"""
    portrait_tests = select(Test.id).join(Category).where(Category.name != "Профориентация")
    total = (await session.execute(select(func.count()).select_from(portrait_tests.subquery()))).scalar_one()
    passed = (await session.execute(
        select(func.count(func.distinct(Progress.test_id)))
        .where(Progress.user_id == user_id, Progress.test_id.in_(portrait_tests))
    )).scalar_one()
    return total > 0 and passed >= total
