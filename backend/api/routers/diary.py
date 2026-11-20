import asyncio
import re
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.analysis_results import format_test_results, load_analysis_test_results
from backend.api.ai_jobs import check_prompt_size, start_ai_job
from backend.api.common import AI_MODEL, GENDER_NEUTRAL_RULE, ai_endpoint, get_session, run_in_background
from backend.api.security import validate_twa_data
from backend.billing import refund, refund_charge
from backend.bonuses import award
from backend.database.models import Category, ContentLog, DiaryEntry, Test
from backend.token_usage import complete_charge
from settings import settings

router = APIRouter()
MAX_DIARY_TEXT = 12_000
MAX_DIARY_ADDITIONS = 24_000
MAX_ACTIVE_DICTATIONS = 3
_active_dictations: set[int] = set()


def _diary_text(value, empty_message):
    if not isinstance(value, str) or not value.strip():
        raise HTTPException(400, empty_message)
    if len(value) > MAX_DIARY_TEXT:
        raise HTTPException(413, f"В поле дневника может быть не больше {MAX_DIARY_TEXT} символов.")
    return value.strip()


def _serialize_diary_entry(e: DiaryEntry) -> dict:
    return {
        "id": e.id,
        "date": e.date.isoformat(),
        "event": e.event,
        "reaction": e.reaction,
        "addition": e.addition,
        "rating": e.rating,
        "portrait_match_score": e.portrait_match_score,
        "portrait_match_explanation": e.portrait_match_explanation
    }

def _longest_streak(dates) -> int:
    """Самая длинная серия дней подряд с записями за всё время."""
    best = run = 0
    prev = None
    for day in sorted(dates):
        run = run + 1 if prev and day - prev == timedelta(days=1) else 1
        best = max(best, run)
        prev = day
    return best

def _count_streak(dates, today):
    """Сколько дней подряд есть записи. Если сегодня ещё не писали, серия считается до вчера — она ещё не прервана."""
    days = set(dates)
    day = today if today in days else today - timedelta(days=1)
    streak = 0
    while day in days:
        streak += 1
        day -= timedelta(days=1)
    return streak

async def _start_reaction_analysis(
    user_id: int, entry_id: int, session: AsyncSession, follow_up: dict | None = None, *, prepare=None,
) -> bool:
    """Запускает разбор в фоне, если есть хотя бы один результат и Premium или хватает баланса.
    Фронт по ответу решает, ждать ли разбор. follow_up — прежний разбор и дополнение к нему (см. add_diary_addition)."""
    test_results = await load_analysis_test_results(session, user_id, require_all_categories=False)
    if not test_results:
        return False
    try:
        results_text = format_test_results(test_results)
        await start_ai_job(session, user_id, "diary_answer", lambda charged: _analyze_reaction_bg(
            user_id, entry_id, results_text, charged, follow_up,
        ), prepare=prepare)
    except HTTPException as error:
        if prepare is not None and error.status_code in {429, 503}:
            # Leave the addition in the form for retry if we could not reserve an AI slot.
            raise
        return False
    return True

# Эндпоинт 2: Получение записей дневника за месяц
@router.get("/api/diary")
async def get_diary_entries(
    year: int,
    month: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")

    from sqlalchemy import extract
    query = select(DiaryEntry).where(
        DiaryEntry.user_id == user_id,
        extract('year', DiaryEntry.date) == year,
        extract('month', DiaryEntry.date) == month
    )
    filtered = (await session.execute(query)).scalars().all()

    return [_serialize_diary_entry(e) for e in filtered]

# Эндпоинт 2.1: Экран «Сегодня» — записи за последние 7 дней и серия дней подряд.
# Сегодняшнюю дату присылает клиент: день пользователя зависит от его часового пояса
@router.get("/api/diary/overview")
async def get_diary_overview(
    today: str,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    try:
        today_date = datetime.strptime(today, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="today должен быть в формате YYYY-MM-DD")

    week_start = today_date - timedelta(days=6)
    entries = (await session.execute(
        select(DiaryEntry)
        .where(DiaryEntry.user_id == user_id, DiaryEntry.date >= week_start, DiaryEntry.date <= today_date)
        .order_by(DiaryEntry.date, DiaryEntry.id)
    )).scalars().all()

    # Серия длиннее года не важна — дальше не смотрим
    dates = (await session.execute(
        select(DiaryEntry.date).distinct()
        .where(DiaryEntry.user_id == user_id, DiaryEntry.date <= today_date,
               DiaryEntry.date > today_date - timedelta(days=366))
    )).scalars().all()

    return {
        "entries": [_serialize_diary_entry(e) for e in entries],
        "streak": _count_streak(dates, today_date),
    }

# Эндпоинт 2.2: Одна запись — фронт опрашивает её, пока идёт разбор
@router.get("/api/diary/{entry_id}")
async def get_diary_entry(
    entry_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    entry = (await session.execute(
        select(DiaryEntry).where(DiaryEntry.id == entry_id, DiaryEntry.user_id == user_id)
    )).scalars().first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return _serialize_diary_entry(entry)

# Эндпоинт 3: Создание записи в дневнике
@router.post("/api/diary")
async def create_diary_entry(
    data: dict, # Ожидаем JSON: {"date": "YYYY-MM-DD", "event": "...", "reaction": "...", "rating": 5}
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    try:
        entry_date = datetime.strptime(data.get("date", ""), "%Y-%m-%d").date()
    except (TypeError, ValueError):
        raise HTTPException(400, "Укажи дату в формате YYYY-MM-DD.") from None
    event = _diary_text(data.get("event"), "Заполни событие и реакцию.")
    reaction = _diary_text(data.get("reaction"), "Заполни событие и реакцию.")
    rating = data.get("rating")
    if rating is not None and (type(rating) is not int or not -(2**31) <= rating < 2**31):
        raise HTTPException(400, "Оценка должна быть целым числом.")

    created_at = datetime.utcnow()
    new_entry = DiaryEntry(
        user_id=user_id,
        created_at=created_at,
        date=entry_date,
        event=event,
        reaction=reaction,
        rating=rating,
    )
    session.add_all([new_entry, ContentLog(user_id=user_id, kind="diary_entry", created_at=created_at)])
    await session.commit()
    await session.refresh(new_entry)

    # Разбор запускается только здесь: фронт его не дублирует, а ждёт, опрашивая запись
    analysis_started = await _start_reaction_analysis(user_id, new_entry.id, session)

    return {"id": new_entry.id, "status": "success", "analysis_started": analysis_started}

# Диктовка: аудио из формы записи → текст. Распознаёт свой сервис stt (stt/app.py), без ИИ-агента.
# Доступ — Premium или одна пробная диктовка (backend/dictation.py)
@router.post("/api/diary/transcribe")
async def transcribe_dictation(request: Request, user_data: dict = Depends(validate_twa_data)):
    user_id = user_data["id"]
    if user_id in _active_dictations:
        raise HTTPException(429, "Твоя диктовка уже распознаётся.")
    if len(_active_dictations) >= MAX_ACTIVE_DICTATIONS:
        raise HTTPException(503, "Диктовка сейчас занята. Попробуй чуть позже.", headers={"Retry-After": "10"})
    _active_dictations.add(user_id)
    try:
        return await _transcribe_dictation(request, user_id)
    finally:
        _active_dictations.discard(user_id)


async def _transcribe_dictation(request: Request, user_id: int):
    import time

    import httpx
    from backend import dictation
    from backend.alerts import raise_alert
    from backend.billing import is_premium
    from backend.database import async_session
    from backend.database.models import User
    from backend.redis_db import async_redis

    # Короткие сессии к базе: соединение не должно висеть, пока запись ждет очереди на распознавание
    async with async_session() as session:
        trial = not is_premium(await session.get(User, user_id))
        if trial and await dictation.trial_used(session, user_id):
            raise HTTPException(status_code=403, detail="Диктовка доступна с Premium")
    # Пробную диктовку нельзя запустить дважды параллельно
    trial_key = f"dictation-trial:{user_id}"
    if trial and not await async_redis.set(trial_key, 1, ex=10 * 60, nx=True):
        raise HTTPException(status_code=409, detail="Пробная диктовка уже распознаётся")

    try:
        refusal = await dictation.check_limits(user_id)
        if refusal:
            raise HTTPException(status_code=429, detail=refusal)

        audio = bytearray()
        try:
            async with asyncio.timeout(40):
                async for chunk in request.stream():
                    if len(audio) + len(chunk) > dictation.MAX_BYTES:
                        raise HTTPException(413, "Запись слишком длинная")
                    audio.extend(chunk)
        except TimeoutError:
            raise HTTPException(408, "Истекло время отправки записи") from None
        if not audio:
            raise HTTPException(status_code=400, detail="Пустая запись")

        unavailable = "Распознавание речи сейчас недоступно. Попробуй позже или напиши текстом"
        started = time.monotonic()
        try:
            async with asyncio.timeout(180), httpx.AsyncClient(timeout=180) as client:
                res = await client.post(f"{settings.STT_URL}/transcribe", content=bytes(audio))
        except (httpx.HTTPError, TimeoutError) as error:
            logger.warning("STT unavailable: {}", type(error).__name__)
            await dictation.record(user_id, "error", trial, total=time.monotonic() - started)
            run_in_background(raise_alert("stt_down", "Диктовка не работает", f"Сервис распознавания не ответил: {type(error).__name__}"))
            raise HTTPException(status_code=503, detail=unavailable)
        if res.status_code == 413:
            raise HTTPException(status_code=413, detail="Запись слишком длинная")
        if res.status_code == 422:
            raise HTTPException(status_code=400, detail="Не удалось прочитать запись. Попробуй ещё раз")
        if res.status_code == 503:
            raise HTTPException(503, "Диктовка сейчас занята. Попробуй чуть позже.", headers={"Retry-After": "10"})
        if res.status_code != 200:
            logger.warning("STT HTTP error: {}", res.status_code)
            await dictation.record(user_id, "error", trial, total=time.monotonic() - started)
            run_in_background(raise_alert("stt_down", "Диктовка не работает", f"Сервис распознавания ответил {res.status_code}"))
            raise HTTPException(status_code=503, detail=unavailable)

        result = res.json()
        text = (result.get("text") or "").strip()
        await dictation.record(user_id, "ok" if text else "empty", trial, result, total=time.monotonic() - started)
        return {"text": text, "trial_used": trial and bool(text)}
    finally:
        if trial:
            await async_redis.delete(trial_key)

# Эндпоинт 3.1: Дописать запись (дневник попросил подробностей) — старый разбор сбрасывается, запускается новый
@router.patch("/api/diary/{entry_id}")
async def update_diary_entry(
    entry_id: int,
    data: dict, # {"event": "...", "reaction": "..."}
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    entry = (await session.execute(
        select(DiaryEntry).where(DiaryEntry.id == entry_id, DiaryEntry.user_id == user_id)
    )).scalars().first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    event = _diary_text(data.get("event"), "Заполните событие и реакцию")
    reaction = _diary_text(data.get("reaction"), "Заполните событие и реакцию")

    entry.event = event
    entry.reaction = reaction
    entry.portrait_match_score = None
    entry.portrait_match_explanation = None
    await session.commit()

    analysis_started = await _start_reaction_analysis(user_id, entry.id, session)
    return {"status": "success", "analysis_started": analysis_started}

# Эндпоинт 3.2: Дополнить запись — текст дописывается к записи, не меняя её, и дневник читает её заново.
# Если новый разбор не запустить (нет результатов тестов или не хватает баланса), сохраняем прежний ответ
@router.post("/api/diary/{entry_id}/addition")
async def add_diary_addition(
    entry_id: int,
    data: dict, # {"text": "..."}
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    entry = (await session.execute(
        select(DiaryEntry).where(DiaryEntry.id == entry_id, DiaryEntry.user_id == user_id).with_for_update()
    )).scalars().first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    text = _diary_text(data.get("text"), "Напишите, что хотите добавить")

    earlier_addition = entry.addition
    addition = f"{earlier_addition}\n\n{text}" if earlier_addition else text
    if len(addition) > MAX_DIARY_ADDITIONS:
        raise HTTPException(413, f"В дополнениях может быть не больше {MAX_DIARY_ADDITIONS} символов.")
    previous = entry.portrait_match_score, entry.portrait_match_explanation
    # Дневник продолжает разговор о записи: видит свой прежний разбор и отвечает на дополнение к нему
    follow_up = {
        "score": previous[0],
        "reply": previous[1],
        "earlier_addition": earlier_addition,
        "text": text,
        "entry_text": (entry.event, entry.reaction, addition),
    } if previous[0] is not None and previous[1] else None
    async def prepare():
        # Сохраняем дополнение после того, как для его разбора зарезервировано место.
        entry.addition = addition
        entry.portrait_match_score = None
        entry.portrait_match_explanation = None
        await session.commit()

    analysis_started = await _start_reaction_analysis(user_id, entry.id, session, follow_up, prepare=prepare)
    if not analysis_started:
        entry.addition = addition
        entry.portrait_match_score, entry.portrait_match_explanation = previous
        await session.commit()

    return {"status": "success", "addition": entry.addition, "analysis_started": analysis_started}

# Эндпоинт 4: Удаление записи из дневника
@router.delete("/api/diary/{entry_id}")
async def delete_diary_entry(
    entry_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    
    # Находим запись по id и проверяем, что она принадлежит пользователю
    query = select(DiaryEntry).where(DiaryEntry.id == entry_id, DiaryEntry.user_id == user_id)
    result = await session.execute(query)
    entry = result.scalars().first()
    
    if not entry:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Entry not found or unauthorized")
        
    await session.delete(entry)
    await session.commit()
    
    return {"status": "success"}

# Эндпоинт 4.5: Удаление оценки дня у записи
@router.delete("/api/diary/{entry_id}/rating")
async def delete_diary_rating(
    entry_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    query = select(DiaryEntry).where(DiaryEntry.id == entry_id, DiaryEntry.user_id == user_id)
    entry = (await session.execute(query)).scalars().first()
    
    if not entry:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Entry not found")
        
    entry.rating = None
    await session.commit()
    return {"status": "success"}

# Промпт ИИ-разбора записей дневника — в отдельном файле, чтобы его можно было менять, не трогая код.
DIARY_PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"
DIARY_ANALYSIS_PROMPT = (DIARY_PROMPTS_DIR / "diary_analysis.txt").read_text(encoding="utf-8").strip()
DIARY_ANALYSIS_MISSING_TESTS = (DIARY_PROMPTS_DIR / "diary_missing_tests.txt").read_text(encoding="utf-8").strip()

# Формат ответа читает парсер в _analyze_reaction_bg (оценка → шкала в приложении, текст → разбор),
# поэтому он живёт в коде, а не в файле промпта.
DIARY_ANALYSIS_OUTPUT_FORMAT = """ТЕХНИЧЕСКИЙ ФОРМАТ ВЫВОДА (обязателен: ответ разбирает программа)

Шаги гейт, парсер, аналитик, валидатор и самопроверка выполняй про себя и в ответ не выводи.

Первая строка — одно число от 0 до 100: насколько описанная реакция согласуется с относящимися к ситуации результатами тестов. Это приблизительная оценка, не оценка правильности реакции. Учитывай только доступные данные.
Вторая строка — ровно три знака: ===
Дальше — только текст для человека в Markdown: пять частей генератора, каждая начинается с заголовка на отдельной строке:
## Зеркало
## Мои предположения
## Что можно дополнить
## Могу предложить попробовать
## Что проверить после

Между заголовком и текстом, а также между абзацами оставляй пустую строку. Один абзац — одна мысль, 2–4 предложения.
Ключевое наблюдение можно выделить **жирным**, не выделяй целиком абзацы. Отдельные варианты действий оформляй маркированным списком, последовательность шагов — нумерованным. Не используй таблицы, декоративные символы и дополнительные вводные фразы.
Каждую часть делай удобной для чтения по диагонали: короткая основная мысль, затем отдельные детали. Для подписанных пояснений используй отдельные абзацы вида **Наблюдение:** текст или **Предположение:** текст, только когда такая подпись помогает понять смысл. Разные предположения и варианты действий разделяй пунктами списка. Короткую дословную цитату из записи можно выделить блоком >; не придумывай цитаты. Не добавляй текст ради заполнения формата и не повторяй один вывод в нескольких частях.

Если разбора нет, первая строка — слово НЕТ (а не число):
— сработал гейт — после === только вопрос по шаблону гейта;
— видишь признаки кризиса — после === только кризисный ответ;
— событие — бессмысленный набор символов или спам — после === фраза «Недостаточно данных для разбора.»

В вопросе гейта называй недостающее простыми словами, а не названиями слотов. В приложении человек заполняет поля «Событие» и «Реакция», и фраза «не хватает события» при заполненном поле его запутает. Поясни, чего именно не хватает: например, «что конкретно произошло — где, с кем, что происходило с тобой в тот момент» или «какие ещё чувства и мысли появились, кроме усталости». Сам шаблон «В записи: … Для разбора не хватает … Опиши заново, добавив их.» сохраняй."""

# Оценка, которую сохраняем, когда модель не делала разбор (гейт, кризис, спам): приложение не показывает шкалу
NO_ANALYSIS_SCORE = -1


async def _analyze_reaction_bg(user_id: int, entry_id: int, test_results_text: str, charged: int | None, follow_up: dict | None = None):
    result = await _run_reaction_analysis(user_id, entry_id, test_results_text, follow_up, charged)
    if result is None:
        await refund(user_id, charged)
        # Сбой ИИ после дополнения не должен стирать оплаченный прежний ответ
        if follow_up:
            await _restore_reply(user_id, entry_id, follow_up)
    return result


async def _restore_reply(user_id: int, entry_id: int, follow_up: dict):
    from backend.database import async_session
    async with async_session() as db:
        entry = (await db.execute(select(DiaryEntry).where(
            DiaryEntry.id == entry_id, DiaryEntry.user_id == user_id,
        ).with_for_update())).scalars().first()
        if entry and entry.portrait_match_score is None and (entry.event, entry.reaction, entry.addition) == follow_up["entry_text"]:
            entry.portrait_match_score = follow_up["score"]
            entry.portrait_match_explanation = follow_up["reply"]
            await db.commit()


def _follow_up_messages(follow_up: dict) -> list:
    """Прежний разбор — ответ ассистента в том же формате, дополнение — следующая реплика человека"""
    score = "НЕТ" if follow_up["score"] == NO_ANALYSIS_SCORE else str(follow_up["score"])
    return [
        {"role": "assistant", "content": f"{score}\n===\n{follow_up['reply']}"},
        {"role": "user", "content": (
            "Человек дополнил эту запись после твоего ответа.\n"
            "Дополнение: " + follow_up["text"] + "\n\n"
            "Сделай новый полный разбор записи вместе с дополнением в том же формате. "
            "Учитывай прежний ответ как контекст разговора, а выводы проверь по записи и переданным результатам тестов. "
            "Если дополнение отвечает на «Что можно дополнить» или проверяет твоё предположение, скажи, что это меняет. "
            "Оценку пересчитай по записи целиком."
        )},
    ]


async def _run_reaction_analysis(user_id: int, entry_id: int, test_results_text: str, follow_up: dict | None = None, charged: int | None = None):
    import httpx
    from backend.database import async_session

    try:
        ai_url, ai_token = ai_endpoint()
        if not ai_url or not ai_token:
            logger.warning("Diary AI endpoint is not configured")
            return None

        query = select(DiaryEntry).where(DiaryEntry.id == entry_id, DiaryEntry.user_id == user_id)
        async with async_session() as db:
            entry = (await db.execute(query)).scalars().first()
            if entry is None:
                return None
            entry_text = entry.event, entry.reaction, entry.addition
            if follow_up and entry_text != follow_up["entry_text"]:
                return None
            catalog = await db.execute(
                select(Test.name, Category.name, Test.description).join(Category).order_by(Test.id)
            )
            catalog_text = "\n".join(
                f"«{name}» ({category})" + (f" — {description.strip()}" if description else "")
                for name, category, description in catalog
            )

        event, reaction, addition = entry_text
        if follow_up:
            addition = follow_up["earlier_addition"]
        user_message = (
            f"Результаты всех пройденных тестов пользователя:\n{test_results_text}"
            f"\n\nСобытие: {event}\nРеакция: {reaction}"
            + (f"\nДополнение (дописано позже): {addition}" if addition else "")
        )
        system_prompt = "\n\n".join((
            DIARY_ANALYSIS_PROMPT,
            DIARY_ANALYSIS_OUTPUT_FORMAT,
            GENDER_NEUTRAL_RULE,
            DIARY_ANALYSIS_MISSING_TESTS,
            f"КАТАЛОГ ТЕСТОВ ПРИЛОЖЕНИЯ\n{catalog_text}",
        ))
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ] + (_follow_up_messages(follow_up) if follow_up else [])
        check_prompt_size(*(message["content"] for message in messages))

        async with asyncio.timeout(120), httpx.AsyncClient(timeout=120.0) as client:
            ai_response = await client.post(
                ai_url,
                headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                json={"model": AI_MODEL, "max_tokens": 8192, "messages": messages},
            )
        if ai_response.status_code >= 400:
            logger.warning("Diary AI HTTP error: {}", ai_response.status_code)
            return None

        choice = (ai_response.json().get("choices") or [{}])[0]
        generated_text = ((choice.get("message") or {}).get("content") or "").strip()
        if not generated_text:
            logger.warning("Diary AI returned an empty response")
            return None

        score = 50
        if "===" in generated_text:
            score_part, explanation = generated_text.split("===", 1)
            explanation = explanation.strip()
            numbers = re.findall(r"\d+", score_part)
            if "НЕТ" in score_part.upper() and not numbers:
                score = NO_ANALYSIS_SCORE
            elif numbers:
                score = int(numbers[-1])
        else:
            match = re.search(r"\b(\d{1,3})\b", generated_text)
            if match:
                score = int(match.group(1))
            explanation = generated_text

        if score != NO_ANALYSIS_SCORE:
            score = max(0, min(100, score))
        async with async_session() as db:
            entry = (await db.execute(query.with_for_update().execution_options(populate_existing=True))).scalars().first()
            if entry is None or (entry.event, entry.reaction, entry.addition) != entry_text:
                return None
            entry.portrait_match_score = score
            entry.portrait_match_explanation = explanation
            # Ответ становится виден одновременно с итоговым балансом.
            if score == NO_ANALYSIS_SCORE:
                await refund_charge(db, user_id, charged)
            else:
                await complete_charge(db, charged)
                db.add(ContentLog(user_id=user_id, kind="diary_answer"))
                await award(user_id, "diary_answer", session=db)
            await db.commit()
        return {"score": score, "explanation": explanation}
    except Exception as error:
        logger.warning("Diary analysis failed: {}", type(error).__name__)
        return None


@router.post("/api/analyze-reaction/{entry_id}")
async def analyze_reaction(
    entry_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    test_results = await load_analysis_test_results(session, user_id, require_all_categories=False)
    if not test_results:
        raise HTTPException(status_code=400, detail="Чтобы получить разбор записи, пройди любой тест.")
    results_text = format_test_results(test_results)
    entry = (await session.execute(select(DiaryEntry).where(
        DiaryEntry.id == entry_id, DiaryEntry.user_id == user_id,
    ))).scalars().first()
    if entry is None:
        raise HTTPException(404, "Запись не найдена.")
    check_prompt_size(results_text, entry.event, entry.reaction, entry.addition or "")
    task = await start_ai_job(session, user_id, "diary_answer", lambda charged: _analyze_reaction_bg(
        user_id, entry_id, results_text, charged,
    ))
    # Списание и запись результата завершаются даже после закрытия страницы.
    result = await asyncio.shield(task)
    if result is not None:
        return {"status": "success", "score": result["score"], "explanation": result["explanation"]}
    else:
        raise HTTPException(status_code=500, detail="Failed to analyze reaction")
