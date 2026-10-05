"""Служебный API для бота с тестами (работает на сервере в NL).

Бот не хранит тесты у себя: категории, тесты и результаты берутся из этой же базы,
поэтому они всегда совпадают с мини-приложением, а пройденный в боте тест засчитывается и там.
Доступ — по токену SERVICE_API_TOKEN (плюс Caddy пускает /api/service/* только с IP бота).
"""
import hmac
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.database import async_session
from backend.database.models import User, Category, Test, Question, Answer, Progress, ProgressLog, Result
from settings import settings

CAREER_CATEGORY = "Профориентация"


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session


def check_service_token(x_service_token: str = Header(default="")):
    if not settings.SERVICE_API_TOKEN or not hmac.compare_digest(x_service_token, settings.SERVICE_API_TOKEN):
        raise HTTPException(status_code=403, detail="Forbidden")


router = APIRouter(prefix="/api/service", dependencies=[Depends(check_service_token)])


class ServiceUser(BaseModel):
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None


class SubmitRequest(BaseModel):
    user: ServiceUser
    answer_ids: List[int]


async def upsert_user(session: AsyncSession, data: ServiceUser) -> User:
    # Так же, как UserMiddleware основного бота: создаём при первом визите, обновляем имя
    user = await session.get(User, data.id)
    if user is None:
        user = User(
            id=data.id,
            tg_first_name=data.first_name,
            tg_last_name=data.last_name,
            username=data.username,
            registration_date=date.today(),
        )
        session.add(user)
    else:
        user.tg_first_name = data.first_name
        user.tg_last_name = data.last_name
        user.username = data.username
    await session.flush()
    return user


def category_sort_key(category: Category):
    # Порядок как в мини-приложении: Темперамент первым, Профориентация последней
    name = category.name.lower()
    return 0 if name == "темперамент" else (2 if name == CAREER_CATEGORY.lower() else 1), category.id


def test_sort_key(test: Test):
    return test.order_number is None, test.order_number or 0, test.id


async def find_result_text(session: AsyncSession, test_id: int, points: int) -> str:
    result = (await session.execute(select(Result).where(
        Result.test_id == test_id,
        Result.range_from <= points,
        (Result.range_to >= points) | (Result.range_to.is_(None)),
    ))).scalars().first()
    return result.name if result and result.name else "Результат не найден"


async def progress_text(session: AsyncSession, progress: Progress) -> str:
    if progress.hardcode_value:
        return progress.hardcode_value
    return await find_result_text(session, progress.test_id, progress.value or 0)


def is_locked(category: Category, user: Optional[User]) -> bool:
    return category.name == CAREER_CATEGORY and not (user and user.has_career_access)


@router.post("/users")
async def service_upsert_user(data: ServiceUser, session: AsyncSession = Depends(get_session)):
    await upsert_user(session, data)
    await session.commit()
    return {"ok": True}


@router.get("/catalog")
async def service_catalog(user_id: int, session: AsyncSession = Depends(get_session)):
    user = await session.get(User, user_id)
    categories = (await session.execute(
        select(Category).options(selectinload(Category.tests))
    )).scalars().all()
    passed_ids = set((await session.execute(
        select(Progress.test_id).where(Progress.user_id == user_id)
    )).scalars().all())

    return {
        "categories": [
            {
                "id": category.id,
                "name": category.name,
                "description": category.description,
                "locked": is_locked(category, user),
                "tests": [
                    {"id": test.id, "name": test.name, "passed": test.id in passed_ids}
                    for test in sorted(category.tests, key=test_sort_key)
                ],
            }
            for category in sorted(categories, key=category_sort_key)
        ]
    }


@router.get("/tests/{test_id}")
async def service_test(test_id: int, user_id: int, session: AsyncSession = Depends(get_session)):
    test = (await session.execute(
        select(Test).where(Test.id == test_id).options(
            selectinload(Test.category),
            selectinload(Test.questions).selectinload(Question.answers),
        )
    )).scalar_one_or_none()
    if not test:
        raise HTTPException(status_code=404, detail="Тест не найден")

    user = await session.get(User, user_id)
    progress = (await session.execute(
        select(Progress).where(Progress.test_id == test_id, Progress.user_id == user_id)
    )).scalars().first()

    return {
        "id": test.id,
        "name": test.name,
        "description": test.description,
        "category_id": test.category_id,
        "locked": is_locked(test.category, user),
        "result": await progress_text(session, progress) if progress else None,
        "questions": [
            {
                "id": question.id,
                "name": question.name,
                "answers": [{"id": a.id, "name": a.name.strip()} for a in sorted(question.answers, key=lambda a: a.id)],
            }
            for question in test.questions
        ],
    }


@router.post("/tests/{test_id}/submit")
async def service_submit(test_id: int, payload: SubmitRequest, session: AsyncSession = Depends(get_session)):
    from backend.telegram.views.hardcoded_tests import get_hardcoded_test_result

    test = (await session.execute(
        select(Test).where(Test.id == test_id).options(
            selectinload(Test.category),
            selectinload(Test.questions).selectinload(Question.answers),
        )
    )).scalar_one_or_none()
    if not test:
        raise HTTPException(status_code=404, detail="Тест не найден")

    user = await upsert_user(session, payload.user)
    if is_locked(test.category, user):
        raise HTTPException(status_code=403, detail="Блок «Профориентация» не куплен")

    # Ровно один ответ на каждый вопрос именно этого теста
    answers_by_id = {a.id: a for q in test.questions for a in q.answers}
    answers = [answers_by_id.get(answer_id) for answer_id in payload.answer_ids]
    if None in answers or len({a.question_id for a in answers}) != len(test.questions) \
            or len(answers) != len(test.questions):
        raise HTTPException(status_code=400, detail="Ответы не соответствуют вопросам теста")

    # Повторное прохождение заменяет старый результат
    await session.execute(delete(Progress).where(Progress.test_id == test_id, Progress.user_id == user.id))
    if test.hardcode_test:
        result_text = get_hardcoded_test_result(answers, test)
        session.add(Progress(test_id=test_id, user_id=user.id, value=0, hardcode_value=result_text))
    else:
        points = sum(a.value or 0 for a in answers)
        result_text = await find_result_text(session, test_id, points)
        session.add(Progress(test_id=test_id, user_id=user.id, value=points))
    session.add(ProgressLog(user_id=user.id, test_id=test_id))

    await session.commit()
    return {"result": result_text}


@router.delete("/tests/{test_id}/progress")
async def service_reset(test_id: int, user_id: int, session: AsyncSession = Depends(get_session)):
    await session.execute(delete(Progress).where(Progress.test_id == test_id, Progress.user_id == user_id))
    await session.commit()
    return {"ok": True}
