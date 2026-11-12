from dataclasses import dataclass

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import Category, Progress, Result, Test


@dataclass(frozen=True)
class TestResult:
    name: str
    category: str
    text: str


def has_test_result(hardcoded: str | None, points: int | None) -> bool:
    return bool((hardcoded or "").strip()) or points is not None


async def load_analysis_test_results(session: AsyncSession, user_id: int) -> list[TestResult]:
    """Возвращает результаты для анализа, если в каждой категории с тестами есть результат."""
    interpretation = (
        select(Result.name)
        .where(
            Result.test_id == Progress.test_id,
            Result.range_from <= Progress.value,
            (Result.range_to >= Progress.value) | Result.range_to.is_(None),
        )
        .order_by(Result.id)
        .limit(1)
        .scalar_subquery()
    )
    query = (
        select(Test.id, Test.name, Category.id, Category.name, Progress.hardcode_value, Progress.value, interpretation)
        .select_from(Test)
        .join(Category, Test.category_id == Category.id)
        .outerjoin(Progress, and_(Progress.test_id == Test.id, Progress.user_id == user_id))
        .order_by(Test.id, Progress.created_at.desc(), Progress.id.desc())
    )
    results = []
    seen_tests = set()
    test_categories = set()
    completed_categories = set()
    for test_id, name, category_id, category, hardcoded, points, description in await session.execute(query):
        if test_id in seen_tests:
            continue
        seen_tests.add(test_id)
        test_categories.add(category_id)
        if not has_test_result(hardcoded, points):
            continue

        text = (hardcoded or "").strip()
        if not text:
            text = f"Баллы: {points}"
            if description and description.strip():
                text += f"\n{description.strip()}"
        results.append(TestResult(name=name, category=category, text=text))
        completed_categories.add(category_id)
    return results if completed_categories == test_categories else []


def format_test_results(results: list[TestResult]) -> str:
    return "\n\n".join(f"Тест «{result.name}» ({result.category})\n{result.text}" for result in results)
