from datetime import datetime
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from backend.api.security import validate_twa_data
from sqlalchemy.orm import selectinload, joinedload
from backend.database import async_session
from backend.database.models import User, Category, Test, Question, Answer, Progress, Result, DiaryEntry, PersonalityPortrait, BehavioralReport
from backend.telegram.views.hardcoded_tests import get_hardcoded_test_result

app = FastAPI(title="TheABC Diary API")

# Разрешаем CORS для вашего Github Pages
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # В идеале здесь должен быть URL вашего Github Pages
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session

# Эндпоинт 1: Получение данных для Личного Кабинета (Тесты)
@app.get("/api/profile")
async def get_profile(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    
    # Получаем все категории и тесты
    cats_query = select(Category).options(joinedload(Category.tests))
    categories = (await session.execute(cats_query)).scalars().unique().all()
    
    # Получаем прогресс пользователя
    prog_query = select(Progress).where(Progress.user_id == user_id).options(joinedload(Progress.test))
    progresses = (await session.execute(prog_query)).scalars().all()
    
    # Собираем словарь прогресса: test_id -> результат
    user_results = {}
    for p in progresses:
        if p.hardcode_value:
            user_results[p.test_id] = p.hardcode_value
        else:
            if p.value is None:
                user_results[p.test_id] = "Баллы: 0"
                continue
                
            # Ищем текстовый результат по баллам
            # ИСПРАВЛЕНИЕ: строгое (>) на нестрогое (>=) неравенство
            res_query = select(Result).where(
                Result.test_id == p.test_id,
                Result.range_from <= p.value,
                Result.range_to >= p.value
            )
            res_obj = (await session.execute(res_query)).scalars().first()
            user_results[p.test_id] = res_obj.name.capitalize() if res_obj and res_obj.name else f"Баллы: {p.value}"

    # Формируем ответ для React
    result_data = []
    total_tests = 0
    passed_tests = 0
    
    for cat in categories:
        cat_data = {"id": cat.id, "name": cat.name, "tests": []}
        for t in cat.tests:
            total_tests += 1
            passed = t.id in user_results
            if passed:
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
            "tests_count": portrait_obj.tests_count
        }
        
    return {
        "categories": result_data,
        "total_tests": total_tests,
        "passed_tests": passed_tests,
        "portrait": portrait_data
    }

# Эндпоинт 2: Получение записей дневника за месяц
@app.get("/api/diary")
async def get_diary_entries(
    year: int, 
    month: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    
    query = select(DiaryEntry).where(
        DiaryEntry.user_id == user_id,
        # Простая фильтрация по дате (в реальности лучше использовать between)
    )
    entries = (await session.execute(query)).scalars().all()
    
    # Фильтруем на питоне для простоты
    filtered = [e for e in entries if e.date.year == year and e.date.month == month]
    
    return [
        {"id": e.id, "date": e.date.isoformat(), "event": e.event, "reaction": e.reaction, "rating": getattr(e, "rating", None), "portrait_match_score": getattr(e, "portrait_match_score", None)}
        for e in filtered
    ]

# Эндпоинт 3: Создание записи в дневнике
@app.post("/api/diary")
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
    
    return {"id": new_entry.id, "status": "success"}

# Эндпоинт 4: Удаление записи из дневника
@app.delete("/api/diary/{entry_id}")
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
@app.delete("/api/diary/{entry_id}/rating")
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

# Эндпоинт 5: Очистка портрета личности (Тест)
@app.delete("/api/portrait/clear")
async def clear_personality_portrait(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    query = select(PersonalityPortrait).where(PersonalityPortrait.user_id == user_id)
    result = await session.execute(query)
    portrait = result.scalars().first()
    
    if portrait:
        await session.delete(portrait)
        await session.commit()
        return {"status": "success", "message": "Портрет удален"}
    return {"status": "not_found", "message": "Портрет не найден"}

# Эндпоинт 6: Генерация портрета личности
@app.post("/api/portrait/generate")
async def generate_personality_portrait(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    import os
    import httpx
    
    user_id = user_data.get("id")
    
    # 1. Получаем результаты всех тестов
    prog_query = select(Progress).where(Progress.user_id == user_id).options(joinedload(Progress.test))
    progresses = (await session.execute(prog_query)).scalars().all()
    
    total_tests = (await session.execute(select(func.count(Test.id)))).scalar()
    
    # Собираем текстовые интерпретации
    test_results_text = ""
    for p in progresses:
        if not p.test: continue
        res_text = ""
        if p.hardcode_value:
            res_text = p.hardcode_value
        elif p.value is not None:
            res_query = select(Result).where(
                Result.test_id == p.test_id,
                Result.range_from <= p.value,
                Result.range_to >= p.value
            )
            res_obj = (await session.execute(res_query)).scalars().first()
            if res_obj and res_obj.name:
                res_text = res_obj.name
                
        if res_text:
            test_results_text += f"- Тест «{p.test.name}»: {res_text}\n"

    # 2. Формируем промпт
    prompt = f"""Ты — опытный психотерапевт и ИИ-аналитик личности. Твоя задача — составить подробный психологический «Портрет личности» пользователя на основе его ответов на психологические тесты. 
Форматируй текст СТРОГО с использованием Markdown (используй # для заголовков, ** для выделения). Обязательно делай пустую строку (двойной перенос) между абзацами!

ВАЖНО: Никаких вступлений, никаких приветствий, никаких заключений и рекомендаций в конце! Выводи ТОЛЬКО запрошенные разделы.

# Личность
**Тип личности** - [Придумай емкое название]

[Напиши 3-4 предложения, описывающие глубинную суть этого типа личности]

# Устойчивые черты личности
Для этого раздела выведи СТРОГО один блок кода JSON (обязательно оберни его в тройные обратные кавычки с пометкой json), где каждый элемент - это шкала от 0 до 100.
```json
[
  {{"left": "Интроверсия", "right": "Экстраверсия", "leftValue": 30, "rightValue": 70, "description": "Вы черпаете энергию изнутри, но легко адаптируетесь к общению."}},
  {{"left": "Стрессоустойчивость", "right": "Ранимость", "leftValue": 60, "rightValue": 40, "description": "Вы хорошо справляетесь с давлением, но чувствительны к несправедливости."}},
  {{"left": "Консерватизм", "right": "Новаторство", "leftValue": 80, "rightValue": 20, "description": "Вы открыты новому опыту и смело ломаете устаревшие рамки."}},
  {{"left": "Соперничество", "right": "Сотрудничество", "leftValue": 50, "rightValue": 50, "description": "Вы цените командную работу, но умеете отстаивать свои лидерские амбиции."}},
  {{"left": "Системность", "right": "Гибкость", "leftValue": 40, "rightValue": 60, "description": "Вы предпочитаете действовать по ситуации, а не по жесткому плану."}}
]
```

# Поведенческие паттерны
**Реакция на стресс** - [описание]

**Принятие решений** - [описание]

**Стиль продуктивности** - [описание]

**Адаптация к изменениям** - [описание]

**Поведение в конфликте** - [описание]

**Управление энергией** - [описание]

**Отношение к ошибкам** - [описание]

**Восприятие критики** - [описание]

**Социальное взаимодействие** - [описание]

**Источник мотивации** - [описание]

# Карта ценностей
(От 3 до 7 ценностей с описанием, выделяй название ценности жирным шрифтом и делай пустую строку между ними)

# Внутренние барьеры личности
(Главные ментальные ловушки и слепые зоны, каждый пункт с новой строки через дефис)

Вот результаты тестов пользователя:
{test_results_text}"""

    # 3. Делаем запрос к Timeweb Cloud API (Claude 3.5 Sonnet)
    # Используем OpenAI совместимый эндпоинт от Timeweb
    ai_token = os.getenv("TIMEWEB_AI_TOKEN")
    ai_url = os.getenv("TIMEWEB_AI_URL", "https://api.timeweb.cloud/ai/v1/chat/completions")
    
    if not ai_url.endswith("/chat/completions"):
        ai_url = ai_url.rstrip("/") + "/chat/completions"
    
    if not ai_token:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="TIMEWEB_AI_TOKEN is not set on the server")
        
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            ai_response = await client.post(
                ai_url,
                headers={
                    "Authorization": f"Bearer {ai_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "user", "content": prompt}
                    ]
                }
            )
            ai_response.raise_for_status()
            ai_data = ai_response.json()
            generated_text = ai_data["choices"][0]["message"]["content"]
    except httpx.HTTPStatusError as e:
        error_text = e.response.text
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Ошибка API ИИ ({e.response.status_code}): {error_text}")
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Системная ошибка генерации ИИ ({type(e).__name__}): {str(e)} | URL: {ai_url}")

    # 4. Сохраняем в БД
    portrait = (await session.execute(select(PersonalityPortrait).where(PersonalityPortrait.user_id == user_id))).scalars().first()
    if not portrait:
        portrait = PersonalityPortrait(user_id=user_id, content=generated_text, tests_count=total_tests)
        session.add(portrait)
    else:
        portrait.content = generated_text
        portrait.tests_count = total_tests
        
    await session.commit()
    
    return {"status": "success", "portrait": {"content": generated_text, "tests_count": total_tests}}

# Эндпоинт 7: Анализ соответствия реакции портрету
@app.post("/api/analyze-reaction/{entry_id}")
async def analyze_reaction(
    entry_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    import os
    import httpx
    import re
    
    user_id = user_data.get("id")
    
    # Получаем запись дневника
    entry = (await session.execute(select(DiaryEntry).where(DiaryEntry.id == entry_id, DiaryEntry.user_id == user_id))).scalars().first()
    if not entry:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Entry not found")
        
    # Получаем портрет личности
    portrait = (await session.execute(select(PersonalityPortrait).where(PersonalityPortrait.user_id == user_id))).scalars().first()
    if not portrait:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Personality portrait not found")

    prompt = f"""Ты — ИИ-психолог.
Ниже представлен психологический портрет пользователя:
{portrait.content}

Пользователь описал ситуацию:
"{entry.event}"

И свою реакцию на нее:
"{entry.reaction}"

Оцени от 0 до 100, насколько эта реакция соответствует описанному портрету личности (где 0 - совершенно нетипично, 100 - полностью соответствует портрету).
ВАЖНО: Если реакция представляет собой бессмысленный набор букв, бред, спам или совершенно нереалистичный ответ, СТРОГО верни 0.
Выведи ТОЛЬКО одно целое число от 0 до 100, без дополнительных символов, текста или форматирования."""

    ai_token = os.getenv("TIMEWEB_AI_TOKEN")
    ai_url = os.getenv("TIMEWEB_AI_URL", "https://api.timeweb.cloud/ai/v1/chat/completions")
    if not ai_url.endswith("/chat/completions"):
        ai_url = ai_url.rstrip("/") + "/chat/completions"
        
    if not ai_token:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="TIMEWEB_AI_TOKEN is not set")
        
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            ai_response = await client.post(
                ai_url,
                headers={
                    "Authorization": f"Bearer {ai_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "deepseek-v4-flash-thinking",
                    "messages": [
                        {"role": "user", "content": prompt}
                    ]
                }
            )
            ai_response.raise_for_status()
            ai_data = ai_response.json()
            generated_text = ai_data["choices"][0]["message"]["content"].strip()
            
            # Извлекаем числа из ответа
            numbers = re.findall(r'\d+', generated_text)
            if numbers:
                score = int(numbers[0])
                score = max(0, min(100, score)) # clamp 0-100
            else:
                score = 50 # fallback
                
            entry.portrait_match_score = score
            await session.commit()
            
            return {"status": "success", "score": score}
            
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

from pydantic import BaseModel
from typing import Optional
from datetime import date as DateType

class ReportGenerateRequest(BaseModel):
    period: str
    start_date: Optional[DateType] = None
    end_date: Optional[DateType] = None
    report_type: str

@app.get("/api/reports")
async def get_reports(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    query = select(BehavioralReport).where(BehavioralReport.user_id == user_id).order_by(BehavioralReport.created_at.desc())
    reports = (await session.execute(query)).scalars().all()
    
    return [{
        "id": r.id,
        "title": r.title,
        "period_start": r.period_start,
        "period_end": r.period_end,
        "content": r.content,
        "created_at": r.created_at
    } for r in reports]

@app.post("/api/reports/generate")
async def generate_report(
    req: ReportGenerateRequest,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    import httpx
    import json
    import os
    from datetime import datetime, timedelta
    
    user_id = user_data.get("id")
    
    # 1. Получаем портрет личности
    portrait_query = select(PersonalityPortrait).where(PersonalityPortrait.user_id == user_id)
    portrait = (await session.execute(portrait_query)).scalars().first()
    
    if not portrait:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Для формирования отчета сначала необходимо сформировать портрет личности.")

    # 2. Определяем даты
    today = datetime.now().date()
    start_d = None
    end_d = today
    
    if req.period == 'week':
        start_d = today - timedelta(days=7)
    elif req.period == 'month':
        start_d = today - timedelta(days=30)
    elif req.period == '3months':
        start_d = today - timedelta(days=90)
    elif req.period == 'year':
        start_d = today - timedelta(days=365)
    elif req.period == 'custom':
        start_d = req.start_date
        end_d = req.end_date if req.end_date else today
        
    # 3. Достаем записи дневника
    diary_query = select(DiaryEntry).where(DiaryEntry.user_id == user_id)
    if start_d:
        diary_query = diary_query.where(DiaryEntry.date >= start_d)
    if end_d:
        diary_query = diary_query.where(DiaryEntry.date <= end_d)
        
    diary_query = diary_query.order_by(DiaryEntry.date.asc())
    entries = (await session.execute(diary_query)).scalars().all()
    
    if not entries:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Недостаточно записей в дневнике за этот период для формирования отчета.")

    # Формируем текст записей для промпта
    entries_text = ""
    for e in entries:
        entries_text += f"- Дата: {e.date}\nСобытие: {e.event}\nРеакция: {e.reaction}\nОценка дня: {e.rating if e.rating else 'Не указана'}\n\n"

    # Формируем промпт в зависимости от типа отчета
    report_title = ""
    report_prompt = ""
    
    if req.report_type == 'repeating_events':
        report_title = "Повторяющиеся события"
        report_prompt = f"""Ты выступаешь в роли профессионального психолога-аналитика.
Твоя задача: найти повторяющиеся паттерны событий в жизни пользователя на основе его дневника и сопоставить их с его портретом личности.
Портрет личности пользователя:
{portrait.content}

Записи дневника:
{entries_text}

Создай глубокий, живой, динамичный и точный отчет, обращаясь к пользователю на "Вы".
Структура отчета (используй Markdown-разметку, как в портрете личности, с заголовками h2, жирным текстом и маркированными списками):
1. **Главный паттерн**: Самое яркое повторяющееся событие или реакция.
2. **Как это связано с вашим Портретом**: Почему именно так вы реагируете (со ссылкой на черты личности из Портрета).
3. **Рекомендация по трансформации**: Практический совет, как разорвать негативный паттерн или усилить позитивный.

Пиши интересно, без воды, показывай динамику."""
    elif req.report_type == 'effective_reactions':
        report_title = "Эффективность реакций"
        report_prompt = f"""Ты выступаешь в роли профессионального психолога-аналитика.
Твоя задача: оценить эффективность реакций пользователя на различные жизненные ситуации на основе его дневника и портрета личности.
Портрет личности пользователя:
{portrait.content}

Записи дневника:
{entries_text}

Создай глубокий, живой, динамичный и точный отчет, обращаясь к пользователю на "Вы".
Структура отчета (используй Markdown-разметку, как в портрете личности, с заголовками h2, жирным текстом и маркированными списками):
1. **Зоны эффективности**: В каких ситуациях (дни, события) ваша реакция была максимально конструктивной.
2. **Зоны роста**: Где ваши автоматические реакции мешают вам, исходя из вашего Портрета личности.
3. **План улучшения**: Практический совет по управлению своей реакцией в будущем.

Пиши интересно, без воды, показывай динамику."""
    else:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Неизвестный тип отчета.")

    ai_token = os.getenv("TIMEWEB_AI_TOKEN")
    ai_url = os.getenv("TIMEWEB_AI_URL", "https://api.timeweb.cloud/ai/v1/chat/completions")
    if not ai_url.endswith("/chat/completions"):
        ai_url = ai_url.rstrip("/") + "/chat/completions"
        
    if not ai_token:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="AI token not configured")

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            ai_response = await client.post(
                ai_url,
                headers={
                    "Authorization": f"Bearer {ai_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "claude-4.8-opus",
                    "messages": [
                        {"role": "user", "content": report_prompt}
                    ]
                }
            )
            
            if ai_response.status_code == 404:
                # Fallback to claude-3-5-sonnet if 4.8 is not found
                ai_response = await client.post(
                    ai_url,
                    headers={
                        "Authorization": f"Bearer {ai_token}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "claude-3-5-sonnet",
                        "messages": [
                            {"role": "user", "content": report_prompt}
                        ]
                    }
                )

            ai_response.raise_for_status()
            ai_data = ai_response.json()
            generated_text = ai_data["choices"][0]["message"]["content"].strip()
            
            new_report = BehavioralReport(
                user_id=user_id,
                title=report_title,
                period_start=start_d,
                period_end=end_d,
                content=generated_text
            )
            session.add(new_report)
            await session.commit()
            await session.refresh(new_report)
            
            return {
                "id": new_report.id,
                "title": new_report.title,
                "period_start": new_report.period_start,
                "period_end": new_report.period_end,
                "content": new_report.content,
                "created_at": new_report.created_at
            }
            
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")