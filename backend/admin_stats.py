from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from backend.app_activity import APP_TIMEZONE
from backend.database.models import AppOpening, Category, ContentLog, PortraitLog, ProgressLog, Test, User

PERIOD_DAYS = {"today": 1, "week": 7, "month": 30}
REPORT_TYPES = {
    "repeating_events": "Повторяющиеся события",
    "effective_reactions": "Мои реакции",
    "energy": "Энергия",
    "competence": "Чувство компетентности",
    "other": "Другие отчёты",
}


def _parse_bound(value: str | None) -> date | datetime | None:
    if value is None:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        try:
            return datetime.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("Укажите дату в формате ГГГГ-ММ-ДД") from exc


def _utc_bound(value: date | datetime | None, at: time) -> datetime | None:
    if isinstance(value, datetime):
        # Старый клиент присылал datetime-local; значения без смещения интерпретировались как UTC.
        return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value
    if value is not None:
        return APP_TIMEZONE.localize(datetime.combine(value, at)).astimezone(timezone.utc).replace(tzinfo=None)
    return None


def stats_period(period, start_date: str | None, end_date: str | None, *, today: date | None = None):
    if period in PERIOD_DAYS:
        last_day = today or datetime.now(APP_TIMEZONE).date()
        first_day = last_day - timedelta(days=PERIOD_DAYS[period] - 1)
    elif period == "all":
        first_day = last_day = None
    else:
        first_day, last_day = _parse_bound(start_date), _parse_bound(end_date)
        if period == "custom" and first_day is None and last_day is None:
            raise ValueError("Укажите хотя бы одну дату")
    start = _utc_bound(first_day, time.min)
    end = _utc_bound(last_day, time.max)
    if start is not None and end is not None and start > end:
        raise ValueError("Дата начала должна быть раньше даты окончания или совпадать с ней")
    return (first_day, last_day), (start, end)


async def test_catalog(session):
    categories = (await session.scalars(select(Category).options(selectinload(Category.tests)))).all()
    order = {"темперамент": 0, "профориентация": 2}
    return [
        {
            "id": category.id,
            "name": category.name,
            "tests": [{"id": test.id, "name": test.name} for test in sorted(
                category.tests, key=lambda test: (test.order_number is None, test.order_number or 0, test.id)
            )],
        }
        for category in sorted(categories, key=lambda category: (order.get(category.name.lower(), 1), category.id))
    ]


async def collect_stats(session, start, end, unique):
    def in_period(column):
        return [condition for condition in (
            column >= start if start is not None else None,
            column <= end if end is not None else None,
        ) if condition is not None]

    def count(user_id):
        return func.count(user_id.distinct()) if unique else func.count()

    new_users = await session.scalar(select(func.count(User.id)).where(*in_period(User.created_at)))
    if start is None and end is None:
        # У части старых аккаунтов есть отметка об открытии без даты.
        active_users = await session.scalar(select(func.count(User.id)).where(
            or_(User.has_opened_app.is_(True), User.first_opened_at.is_not(None))
        ))
    else:
        active_users = await session.scalar(select(func.count(AppOpening.user_id.distinct())).where(
            *in_period(AppOpening.opened_at)
        ))

    kinds = ContentLog.kind
    content_count = count(ContentLog.user_id)
    diary, reports, compatibility, *report_counts = (await session.execute(select(
        content_count.filter(kinds == "diary_entry"),
        content_count.filter(kinds.in_(REPORT_TYPES)),
        content_count.filter(kinds == "compatibility"),
        *(content_count.filter(kinds == kind) for kind in REPORT_TYPES),
    ).select_from(ContentLog).where(*in_period(ContentLog.created_at)))).one()
    portraits = await session.scalar(select(count(PortraitLog.user_id)).select_from(PortraitLog).where(
        *in_period(PortraitLog.created_at)
    ))

    # ROLLUP считает отдельно по тесту, категории и всему каталогу.
    # В уникальном режиме один человек мог пройти несколько разных тестов.
    test_rows = (await session.execute(select(Test.category_id, Test.id, count(ProgressLog.user_id))
        .join(ProgressLog, ProgressLog.test_id == Test.id)
        .where(*in_period(ProgressLog.created_at))
        .group_by(func.rollup(Test.category_id, Test.id))
    )).all()
    test_counts = {(category_id, test_id): value for category_id, test_id, value in test_rows}
    categories = await test_catalog(session)
    for category in categories:
        category["count"] = test_counts.get((category["id"], None), 0)
        for test in category["tests"]:
            test["count"] = test_counts.get((category["id"], test["id"]), 0)

    return {
        "total_users": new_users,
        "active_users": active_users,
        "diary_entries": diary,
        "reports_generated": reports,
        "reports_by_type": [
            {"type": kind, "name": name, "count": value}
            for (kind, name), value in zip(REPORT_TYPES.items(), report_counts)
            if kind != "other" or value
        ],
        "portraits_generated": portraits,
        "compat_reports_generated": compatibility,
        "tests_completed": test_counts.get((None, None), 0),
        "tests": categories,
    }
