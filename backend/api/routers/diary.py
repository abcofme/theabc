from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.common import AI_MODEL, ai_endpoint, get_session, run_in_background
from backend.api.security import validate_twa_data
from backend.billing import charge, refund
from backend.database.models import DiaryEntry, PersonalityPortrait

router = APIRouter()


def _serialize_diary_entry(e: DiaryEntry) -> dict:
    return {
        "id": e.id,
        "date": e.date.isoformat(),
        "event": e.event,
        "reaction": e.reaction,
        "rating": e.rating,
        "portrait_match_score": e.portrait_match_score,
        "portrait_match_explanation": e.portrait_match_explanation
    }

def _count_streak(dates, today):
    """Сколько дней подряд есть записи. Если сегодня ещё не писали, серия считается до вчера — она ещё не прервана."""
    days = set(dates)
    day = today if today in days else today - timedelta(days=1)
    streak = 0
    while day in days:
        streak += 1
        day -= timedelta(days=1)
    return streak

async def _start_reaction_analysis(user_id: int, entry_id: int, session: AsyncSession) -> bool:
    """Запускает разбор записи в фоне, если он возможен: есть портрет и Premium или хватает баланса.
    Фронт по ответу решает, ждать ли разбор."""
    portrait = (await session.execute(
        select(PersonalityPortrait.id).where(PersonalityPortrait.user_id == user_id)
    )).first()
    if not portrait:
        return False
    try:
        charged = await charge(session, user_id, "diary_answer")
    except HTTPException:
        return False
    run_in_background(_analyze_reaction_bg(user_id, entry_id, charged))
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
    entry_date = datetime.strptime(data["date"], "%Y-%m-%d").date()

    new_entry = DiaryEntry(
        user_id=user_id,
        date=entry_date,
        event=data["event"],
        reaction=data["reaction"],
        rating=data.get("rating")
    )
    session.add(new_entry)
    await session.commit()
    await session.refresh(new_entry)

    # Разбор запускается только здесь: фронт его не дублирует, а ждёт, опрашивая запись
    analysis_started = await _start_reaction_analysis(user_id, new_entry.id, session)

    return {"id": new_entry.id, "status": "success", "analysis_started": analysis_started}

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

    event = (data.get("event") or "").strip()
    reaction = (data.get("reaction") or "").strip()
    if not event or not reaction:
        raise HTTPException(status_code=400, detail="Заполните событие и реакцию")

    entry.event = event
    entry.reaction = reaction
    entry.portrait_match_score = None
    entry.portrait_match_explanation = None
    await session.commit()

    analysis_started = await _start_reaction_analysis(user_id, entry.id, session)
    return {"status": "success", "analysis_started": analysis_started}

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
DIARY_ANALYSIS_PROMPT = (Path(__file__).resolve().parents[2] / "prompts" / "diary_analysis.txt").read_text(encoding="utf-8").strip()

# Формат ответа читает парсер в _analyze_reaction_bg (оценка → шкала в приложении, текст → разбор),
# поэтому он живёт в коде, а не в файле промпта.
DIARY_ANALYSIS_OUTPUT_FORMAT = """ТЕХНИЧЕСКИЙ ФОРМАТ ВЫВОДА (обязателен: ответ разбирает программа)

Шаги гейт, парсер, аналитик, валидатор и самопроверка выполняй про себя и в ответ не выводи.

Первая строка — одно число от 0 до 100: насколько реакция соответствует портрету личности.
Вторая строка — ровно три знака: ===
Дальше — только текст для человека: пять частей генератора, каждая начинается с заголовка на отдельной строке:
Зеркало
Мои предположения
Что можно дополнить
Могу предложить попробовать
Что проверить после

Текст показывается как есть, без разметки: не используй звёздочки, решётки, таблицы и списки с маркерами.

Если разбора нет, первая строка — слово НЕТ (а не число):
— сработал гейт — после === только вопрос по шаблону гейта;
— видишь признаки кризиса — после === только кризисный ответ;
— событие — бессмысленный набор символов или спам — после === фраза «Недостаточно данных для разбора.»

В вопросе гейта называй недостающее простыми словами, а не названиями слотов. В приложении человек заполняет поля «Событие» и «Реакция», и фраза «не хватает события» при заполненном поле его запутает. Поясни, чего именно не хватает: например, «что конкретно произошло — где, с кем, что ты делал» или «что ты почувствовал или подумал, кроме усталости». Сам шаблон «Ты написал: … Для разбора не хватает … Опиши заново, добавив их.» сохраняй."""

# Оценка, которую сохраняем, когда модель не делала разбор (гейт, кризис, спам): приложение не показывает шкалу
NO_ANALYSIS_SCORE = -1


async def _analyze_reaction_bg(user_id: int, entry_id: int, charged: int = 0):
    result = await _run_reaction_analysis(user_id, entry_id)
    # Платят только за разбор: сбой ИИ или просьба дописать запись бесплатны
    if result is None or result["score"] == NO_ANALYSIS_SCORE:
        await refund(user_id, charged)
    return result


async def _run_reaction_analysis(user_id: int, entry_id: int):
    import httpx
    import re
    from backend.database import async_session

    try:
        ai_url, ai_token = ai_endpoint()
        if not ai_url or not ai_token:
            print("TIMEWEB_AI_URL / TIMEWEB_AI_TOKEN не заданы")
            return
            
        async with async_session() as db:
            entry = (await db.execute(select(DiaryEntry).where(DiaryEntry.id == entry_id, DiaryEntry.user_id == user_id))).scalars().first()
            if not entry:
                return
                
            portrait = (await db.execute(select(PersonalityPortrait).where(PersonalityPortrait.user_id == user_id))).scalars().first()
            if not portrait:
                return
            portrait_text = portrait.content or ""
            # Портрет передаём целиком (сейчас 6–7 тыс. символов): промпт сверяет все 20 тестов,
            # и обрезка выдала бы часть из них за непройденные. Лимит — только от аномально длинных
            if len(portrait_text) > 20000:
                portrait_text = portrait_text[:20000] + "\n[портрет обрезан]"
            print(f"Portrait len: {len(portrait_text)}, event len: {len(entry.event)}, reaction len: {len(entry.reaction)}")
            
            SYSTEM_PROMPT = DIARY_ANALYSIS_PROMPT + "\n\n" + DIARY_ANALYSIS_OUTPUT_FORMAT

            user_message = (
                "Портрет пользователя (все результаты тестов с полными описаниями):\n"
                + portrait_text
                + "\n\nСобытие: " + entry.event
                + "\nРеакция: " + entry.reaction
            )

            messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message}
            ]

            async with httpx.AsyncClient(timeout=120.0) as client:
                ai_response = await client.post(
                    ai_url,
                    headers={
                        "Authorization": f"Bearer {ai_token}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": AI_MODEL,
                        "max_tokens": 8192,
                        "messages": messages
                    }
                )

                # Не используем raise_for_status() — обрабатываем явно.
                # Сбой ИИ — не оценка: ничего не сохраняем, иначе в дневнике появится шкала 0%
                if ai_response.status_code >= 400:
                    print(f"AI API HTTP {ai_response.status_code}: {ai_response.text[:500]}")
                    return None

                ai_data = ai_response.json()
                generated_text = (ai_data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
                print(f"AI response for entry {entry_id}: len={len(generated_text)}, first200=[{generated_text[:200]}]")
                if not generated_text:
                    print(f"AI returned empty response for entry {entry_id}: {str(ai_data)[:500]}")
                    return None

                score = 50
                explanation = ""

                if "===" in generated_text:
                    parts = generated_text.split("===", 1)
                    score_part = parts[0].strip()
                    explanation = parts[1].strip() if len(parts) > 1 else ""
                    # Оценка — последнее число перед ===; «НЕТ» — разбора нет
                    numbers = re.findall(r'\d+', score_part)
                    if "НЕТ" in score_part.upper() and not numbers:
                        score = NO_ANALYSIS_SCORE
                    elif numbers:
                        score = int(numbers[-1])
                else:
                    # AI didn't follow format — extract score from anywhere, use full text
                    m = re.search(r'\b(\d{1,3})\b', generated_text)
                    if m:
                        score = int(m.group(1))
                    explanation = generated_text

                if score != NO_ANALYSIS_SCORE:
                    score = max(0, min(100, score))

                entry.portrait_match_score = score
                entry.portrait_match_explanation = explanation
                await db.commit()
                return {"score": score, "explanation": explanation}
                
    except Exception as e:
        print("BG analyze reaction failed:", e)

@router.post("/api/analyze-reaction/{entry_id}")
async def analyze_reaction(
    entry_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    charged = await charge(session, user_id, "diary_answer")

    # Повторный разбор пользователь запускает сам и ждёт его — выполняем сразу, без фона
    result = await _analyze_reaction_bg(user_id, entry_id, charged)
    if result is not None:
        return {"status": "success", "score": result["score"], "explanation": result["explanation"]}
    else:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="Failed to analyze reaction")
