from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from backend.api.common import get_session, is_admin, run_in_background
from backend.api.security import validate_twa_data
from backend.billing import is_premium
from backend.database.models import User, Category, Progress, Result, PersonalityPortrait
from backend.friends import befriend, inviter_from_payload
from backend.pricing import AI_PRICES, DEMO_BALANCE, MAX_TOPUP, MIN_TOPUP, PREMIUM_PRICE

router = APIRouter()


# Для мониторинга и healthcheck контейнера
@router.get("/api/health")
async def health(session: AsyncSession = Depends(get_session)):
    from sqlalchemy import text
    await session.execute(text("SELECT 1"))
    return {"status": "ok"}


# Аватарки: t.me в РФ и из российских ДЦ недоступен, поэтому берём фото через Bot API
# (бот ходит через ретранслятор), кэшируем в Redis и отдаём со своего домена.
AVATAR_TTL = 24 * 60 * 60
AVATAR_MISS_TTL = 6 * 60 * 60


async def _fetch_avatar(user_id: int) -> bytes | None:
    from io import BytesIO
    from backend.telegram.bot import bot

    photos = await bot.get_user_profile_photos(user_id=user_id, limit=1)
    if not photos.photos:
        return None
    sizes = photos.photos[0]
    # Наименьший размер не меньше 160px: аватар на экране до 80px, с запасом на ретину
    size = next((ps for ps in sizes if ps.width >= 160), sizes[-1])
    buf = await bot.download(size.file_id, destination=BytesIO())
    return buf.getvalue()


@router.get("/api/avatar/{user_id}")
async def get_avatar(user_id: int, session: AsyncSession = Depends(get_session)):
    from fastapi.responses import Response
    from backend.redis_db import async_redis

    cache_key = f"avatar:{user_id}"
    cached = await async_redis.get(cache_key)
    if cached is None:
        db_user = await session.get(User, user_id)
        if not db_user or not db_user.photo_url:
            raise HTTPException(status_code=404)
        try:
            cached = await _fetch_avatar(user_id) or b""
        except Exception as e:
            print(f"Avatar fetch failed for {user_id}: {e!r}")
            raise HTTPException(status_code=502)
        await async_redis.set(cache_key, cached, ex=AVATAR_TTL if cached else AVATAR_MISS_TTL)

    if not cached:
        raise HTTPException(status_code=404)
    return Response(content=cached, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


async def _greet_new_friends(user: User, inviter_id: int):
    from backend.telegram.notify import notify
    name = user.tg_first_name or (f"@{user.username}" if user.username else "Ваш друг")
    await notify(inviter_id, f"{name} принял(а) приглашение — теперь вы друзья в «Азбуке Я».",
                 "tab=profile&page=friends", "Открыть друзей")


# Всё о пользователе для приложения: доступ, баланс и цены, тесты с прогрессом, портрет
@router.get("/api/profile")
async def get_profile(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")

    photo_url = user_data.get("photo_url")
    db_user = await session.get(User, user_id)
    if db_user:
        changed = False
        if photo_url and db_user.photo_url != photo_url:
            db_user.photo_url = photo_url
            changed = True
        if not db_user.has_opened_app:
            db_user.has_opened_app = True
            db_user.first_opened_at = datetime.utcnow()
            db_user.balance = (db_user.balance or 0) + DEMO_BALANCE
            changed = True

        # Метка источника для статистики админов (ссылки invite_<код> из админки бота)
        start_param = user_data.get("start_param")
        if start_param and start_param.startswith("invite_"):
            invited_id = start_param.replace("invite_", "")
            if not db_user.invited_id and str(db_user.id) != invited_id:
                db_user.invited_id = invited_id
                changed = True

        if changed:
            await session.commit()

        inviter_id = inviter_from_payload(start_param)
        if inviter_id and await befriend(session, user_id, inviter_id):
            run_in_background(_greet_new_friends(db_user, inviter_id))

    premium = is_premium(db_user)

    # Получаем все категории и тесты
    cats_query = select(Category).options(joinedload(Category.tests))
    categories = (await session.execute(cats_query)).scalars().unique().all()
    categories = sorted(categories, key=lambda c: 0 if c.name.lower() == "темперамент" else (2 if c.name.lower() == "профориентация" else 1))

    # Получаем прогресс пользователя
    prog_query = select(Progress).where(Progress.user_id == user_id).options(joinedload(Progress.test))
    progresses = (await session.execute(prog_query)).scalars().all()

    # Собираем словарь прогресса: test_id -> результат
    user_results = {}

    # Сначала соберем все test_id, по которым есть валидные value
    valid_progresses = [p for p in progresses if not p.hardcode_value and p.value is not None]
    test_ids = [p.test_id for p in valid_progresses]

    # Загружаем все результаты для этих тестов за один запрос
    test_results_map = {}
    if test_ids:
        res_query = select(Result).where(Result.test_id.in_(test_ids))
        all_results = (await session.execute(res_query)).scalars().all()
        for r in all_results:
            if r.test_id not in test_results_map:
                test_results_map[r.test_id] = []
            test_results_map[r.test_id].append(r)

    for p in progresses:
        if p.hardcode_value:
            user_results[p.test_id] = p.hardcode_value
        else:
            if p.value is None:
                user_results[p.test_id] = "Баллы: 0"
                continue

            # Ищем текстовый результат по баллам в памяти
            results_for_test = test_results_map.get(p.test_id, [])
            matched_name = None
            for r in results_for_test:
                if r.range_from <= p.value and r.range_to >= p.value:
                    matched_name = r.name
                    break

            user_results[p.test_id] = matched_name if matched_name else f"Балл: {p.value}"

    # Портрет строится по всем тестам, кроме профориентации: она — для отчётов о работе
    result_data = []
    total_tests = 0
    passed_tests = 0

    for cat in categories:
        cat_data = {"id": cat.id, "name": cat.name, "tests": []}
        for t in cat.tests:
            if cat.name != "Профориентация":
                total_tests += 1
            passed = t.id in user_results
            if passed and cat.name != "Профориентация":
                passed_tests += 1
            cat_data["tests"].append({
                "id": t.id,
                "name": t.name,
                "passed": passed,
                "result_text": user_results.get(t.id, None)
            })
        result_data.append(cat_data)

    portrait_query = select(PersonalityPortrait).where(PersonalityPortrait.user_id == user_id)
    portrait_obj = (await session.execute(portrait_query)).scalars().first()
    portrait_data = None
    if portrait_obj:
        portrait_data = {
            "content": portrait_obj.content,
            "tests_count": portrait_obj.tests_count,
            # По смене времени приложение понимает, что новый портрет готов
            "updated_at": portrait_obj.updated_at.isoformat() if portrait_obj.updated_at else None,
        }

    return {
        "categories": result_data,
        "total_tests": total_tests,
        "passed_tests": passed_tests,
        "portrait": portrait_data,
        "access_level": "Premium" if premium else "Free",
        "access_expires_at": db_user.premium_until.isoformat() if premium else None,
        "has_active_subscription": bool(db_user and db_user.yookassa_payment_method_id),
        "balance": (db_user.balance or 0) if db_user else 0,
        "prices": {
            "premium": PREMIUM_PRICE,
            "min_topup": MIN_TOPUP,
            "max_topup": MAX_TOPUP,
            **AI_PRICES,
        },
        "diary_reminders": db_user.diary_reminders if db_user else True,
        "is_admin": is_admin(db_user, user_data.get("username")),
    }


class SettingsUpdate(BaseModel):
    diary_reminders: bool


@router.patch("/api/settings")
async def update_settings(
    payload: SettingsUpdate,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    db_user = await session.get(User, user_data.get("id"))
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    db_user.diary_reminders = payload.diary_reminders
    await session.commit()
    return {"status": "success"}
