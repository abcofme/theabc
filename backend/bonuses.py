"""Разовые бонусы за первые шаги и за прохождение тестов. Суммы задаются в backend/pricing.py."""
from loguru import logger
from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import async_session
from backend.database.models import Bonus, Progress, ProgressLog, Question, Test, User
from backend.pricing import BONUSES, TEST_COMPLETION_BONUS, TEST_QUESTION_BONUS
from backend.token_usage import credit_tokens

# Задание на странице бонусов и за что начислено — в сообщении о бонусе.
# Порядок — путь по приложению: в нем бонусы и показываются
BONUS_TEXTS = {
    "portrait": ("Сформировать портрет личности", "за портрет личности"),
    "diary_answer": ("Получить ответ дневника на запись", "за первый ответ дневника"),
    "report_repeating_events": ("Отчет «Повторяющиеся события»", "за первый отчет «Повторяющиеся события»"),
    "report_effective_reactions": ("Отчет «Мои реакции»", "за первый отчет «Мои реакции»"),
    "report_energy": ("Отчет «Энергия»", "за первый отчет «Энергия»"),
    "report_competence": ("Отчет «Чувство компетентности»", "за первый отчет «Чувство компетентности»"),
    "friend_invited": ("Пригласить друга по своей ссылке", "за друга по твоей ссылке"),
    "compatibility": ("Узнать совместимость с другом", "за первый анализ совместимости"),
    "install_app": ("Установить приложение на главный экран", "за приложение на главном экране"),
    "light_theme": ("Попробовать светлую тему", "за светлую тему"),
}


async def _credit_bonus(session: AsyncSession, user_id: int, kind: str, amount: int, *, seen: bool = False) -> int:
    inserted_id = await session.scalar(
        insert(Bonus).values(user_id=user_id, kind=kind, amount=amount, seen=seen)
        .on_conflict_do_nothing(constraint="uq_bonuses_user_kind")
        .returning(Bonus.id)
    )
    if inserted_id is None:
        return 0
    await session.execute(update(User).where(User.id == user_id).values(balance=User.balance + amount))
    credit_tokens(session, user_id, amount, "bonus")
    return amount


async def award(user_id: int, kind: str) -> int:
    """Начисляет бонус, если его еще не было. Возвращает начисленные токены, 0 — если бонус уже получен.
    Сбой не мешает самому действию: бонус только пропадает, поэтому ошибки здесь не выходят наружу"""
    amount = BONUSES[kind]
    try:
        async with async_session() as session:
            credited = await _credit_bonus(session, user_id, kind, amount)
            await session.commit()
    except Exception:
        logger.exception(f"Bonus {kind} for {user_id} failed")
        return 0
    return credited


def _test_bonus_amount(question_count: int) -> int:
    return TEST_COMPLETION_BONUS + question_count * TEST_QUESTION_BONUS if question_count > 0 else 0


def _completed_tests(user_id: int):
    # После сброса результата прохождение остаётся в журнале. У старых результатов журнала могло не быть.
    return select(Progress.test_id).where(Progress.user_id == user_id).union(
        select(ProgressLog.test_id).where(ProgressLog.user_id == user_id)
    )


async def available_test_bonus(session: AsyncSession, user_id: int, test_id: int, question_count: int) -> dict | None:
    amount = _test_bonus_amount(question_count)
    if amount <= 0:
        return None
    completed = _completed_tests(user_id).subquery()
    already_passed = select(completed.c.test_id).where(completed.c.test_id == test_id).exists()
    already_earned = select(Bonus.id).where(Bonus.user_id == user_id, Bonus.kind == f"test:{test_id}").exists()
    if await session.scalar(select(or_(already_passed, already_earned))):
        return None
    return {"amount": amount, "completion": TEST_COMPLETION_BONUS, "per_question": TEST_QUESTION_BONUS}


async def award_test_bonus(session: AsyncSession, user_id: int, test_id: int, question_count: int) -> int:
    """Начисляет бонус под блокировкой пользователя перед сохранением результата."""
    bonus = await available_test_bonus(session, user_id, test_id, question_count)
    if bonus is None:
        return 0
    return await _credit_bonus(session, user_id, f"test:{test_id}", bonus["amount"], seen=True)


async def bonus_list(session: AsyncSession, user_id: int) -> list[dict]:
    """Список бонусов за первые шаги для профиля и уведомлений приложения."""
    rows = await session.scalars(select(Bonus).where(
        Bonus.user_id == user_id,
        or_(Bonus.kind.in_(list(BONUS_TEXTS)), Bonus.kind.like("test:%")),
    ))
    got = {b.kind: b for b in rows}
    completed = set(await session.scalars(_completed_tests(user_id)))
    tests = await session.execute(
        select(Test.id, Test.name, func.count(Question.id))
        .outerjoin(Question)
        .group_by(Test.id)
        .order_by(Test.category_id, Test.order_number, Test.id)
    )
    test_bonuses = []
    for test_id, name, question_count in tests:
        kind = f"test:{test_id}"
        earned = got.get(kind)
        amount = _test_bonus_amount(question_count)
        if amount <= 0 and earned is None:
            continue
        already_passed = test_id in completed
        if earned is not None:
            amount = earned.amount
        elif already_passed:
            amount = 0
        test_bonuses.append({
            "kind": kind,
            "test_id": test_id,
            "title": f"Пройти тест «{name}»",
            "reason": f"за первое прохождение теста «{name}»",
            "amount": amount,
            "done": earned is not None or already_passed,
            "new": earned is not None and not earned.seen,
        })
    return test_bonuses + [{
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
