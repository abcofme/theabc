import asyncio
from datetime import datetime
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from backend.api.security import validate_twa_data
from sqlalchemy.orm import selectinload, joinedload
from backend.database import async_session
from backend.database.models import User, Category, Test, Question, Answer, Progress, Result, DiaryEntry, PersonalityPortrait, BehavioralReport, Friendship
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

    # Update photo_url and has_opened_app
    photo_url = user_data.get("photo_url")
    db_user = await session.get(User, user_id)
    if db_user:
        changed = False
        if photo_url and db_user.photo_url != photo_url:
            db_user.photo_url = photo_url
            changed = True
        if not db_user.has_opened_app:
            db_user.has_opened_app = True
            changed = True
        if changed:
            await session.commit()
    
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
            user_results[p.test_id] = res_obj.name if res_obj and res_obj.name else f"Балл: {p.value}"

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
        {
            "id": e.id, 
            "date": e.date.isoformat(), 
            "event": e.event, 
            "reaction": e.reaction, 
            "rating": getattr(e, "rating", None), 
            "portrait_match_score": getattr(e, "portrait_match_score", None),
            "portrait_match_explanation": getattr(e, "portrait_match_explanation", None)
        }
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
    
    # Запускаем анализ реакции в фоне
    asyncio.create_task(_analyze_reaction_bg(user_id, new_entry.id))
    
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

async def _generate_portrait_bg(user_id: int, user_tests_count: int, prompt: str, ai_url: str, ai_token: str):
    import httpx
    import json
    import re
    from fastapi import HTTPException
    from backend.database import async_session
    from backend.database.models import PersonalityPortrait
    from sqlalchemy import select
    
    # Добавляем инструкции для JSON формата и технического саммари
    prompt += '\n\nВАЖНО: В поле description напиши до 3 предложений пояснения, почему ты выбрал именно такое % соответствия на этой шкале.'
    prompt += '\n\nОЧЕНЬ ВАЖНО: Твой ответ должен быть СТРОГИМ JSON объектом. Никакого текста до или после JSON. Формат:\n{"content": "Здесь весь твой сгенерированный красивый Markdown текст (включая блок с ```json внутри для шкал)", "technical_summary": "Здесь напиши техническую выжимку ВСЕХ интерпретаций результатов тестов. Дословно перенеси смыслы всех результатов, но в максимально сокращенном формате (используй сухие факты, списки, аббревиатуры). Никакая информация не должна быть утеряна, но она должна быть максимально сжата. Текст не обязательно должен быть легко читаемым для человека, но обязан быть 100% понятным для других ИИ, так как он будет использоваться как системный контекст личности."}'

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            ai_response = await client.post(
                ai_url,
                headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                json={
                    "model": "claude-3-opus",
                    "messages": [{"role": "user", "content": prompt}]
                }
            )
            
            if ai_response.status_code == 404:
                ai_response = await client.post(
                    ai_url,
                    headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                    json={
                        "model": "claude-3-opus",
                        "messages": [{"role": "user", "content": prompt}]
                    }
                )
            if ai_response.status_code != 200:
                print(f"ERROR FROM TIMEWEB API PORTRAIT: {ai_response.text}")
                return {"status": "error", "message": f"Ошибка AI провайдера: {ai_response.text}"}
                
            ai_response.raise_for_status()
            ai_data = ai_response.json()
            generated_text = ai_data["choices"][0]["message"]["content"].strip()
            
            # Попытка парсинга JSON, учитывая возможные артефакты от Claude
            parsed_json = None
            try:
                parsed_json = json.loads(generated_text)
            except json.JSONDecodeError:
                # Если упало, попробуем вытащить через регулярку
                match = re.search(r'\{[\s\S]*\}', generated_text)
                if match:
                    try:
                        parsed_json = json.loads(match.group(0))
                    except json.JSONDecodeError:
                        pass
            
            if not parsed_json:
                print("Failed to parse JSON from AI response:", generated_text)
                # Фолбэк на случай если нейросеть совсем не справилась
                parsed_json = {
                    "content": generated_text,
                    "technical_summary": ""
                }
            
            content = parsed_json.get("content", "")
            technical_summary = parsed_json.get("technical_summary", "")
            
            async with async_session() as db:
                existing = (await db.execute(select(PersonalityPortrait).where(PersonalityPortrait.user_id == user_id))).scalars().first()
                if existing:
                    existing.content = content
                    existing.technical_summary = technical_summary
                    existing.tests_count = user_tests_count
                    new_portrait = existing
                else:
                    new_portrait = PersonalityPortrait(user_id=user_id, content=content, technical_summary=technical_summary, tests_count=user_tests_count)
                    db.add(new_portrait)
                await db.commit()
                await db.refresh(new_portrait)
            return {"status": "success", "portrait": new_portrait}
    except Exception as e:
        print("BG portrait failed:", e)
        raise HTTPException(status_code=500, detail=f"Failed to generate portrait: {str(e)}")

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

    # 3. Запрос в Timeweb Cloud API (Claude 3.5 Sonnet)
    # Используем TIMEWEB_AI_REPORTS_URL для генерации портрета как отчета
    ai_token = os.getenv("TIMEWEB_AI_REPORTS_TOKEN", os.getenv("TIMEWEB_AI_TOKEN"))
    ai_url = os.getenv("TIMEWEB_AI_REPORTS_URL", os.getenv("TIMEWEB_AI_URL"))
    
    if not ai_url:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="AI URL not configured")
        
    if not ai_url.endswith("/chat/completions"):
        ai_url = ai_url.rstrip("/") + "/chat/completions"
    
    if not ai_token:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="TIMEWEB_AI_TOKEN is not set on the server")
        
    task = asyncio.create_task(_generate_portrait_bg(user_id, total_tests, prompt, ai_url, ai_token))
    try:
        result = await asyncio.shield(task)
        if result["status"] == "success":
            p = result["portrait"]
            return {
                "status": "success",
                "portrait": {
                    "id": p.id,
                    "content": p.content,
                    "tests_count": p.tests_count,
                    "created_at": p.created_at
                }
            }
        return result
    except asyncio.CancelledError:
        raise

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


async def _generate_report_bg(user_id: int, report_title: str, report_prompt: str, start_d, end_d, ai_url: str, ai_token: str, num_entries: int):
    import httpx
    from fastapi import HTTPException
    from backend.database import async_session
    from backend.database.models import BehavioralReport
    try:
        payload = {
            "model": "claude-3-opus",
            "messages": [{"role": "user", "content": report_prompt}]
        }
        print(f"--- Отправка запроса к ИИ ({payload['model']}) ---")
        print(f"URL: {ai_url}")
        print(f"Записей дневника передано: {num_entries}")
        print("-------------------------------------------------", flush=True)

        async with httpx.AsyncClient(timeout=None) as client:
            ai_response = await client.post(
                ai_url,
                headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                json=payload
            )
            
            if ai_response.status_code == 404:
                payload["model"] = "claude-3-opus"
                ai_response = await client.post(
                    ai_url,
                    headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                    json=payload
                )

            if ai_response.status_code != 200:
                print(f"ERROR FROM TIMEWEB API: {ai_response.text}")
            
            ai_response.raise_for_status()

            ai_response.raise_for_status()
            ai_data = ai_response.json()
            generated_text = ai_data["choices"][0]["message"]["content"].strip()
            
            async with async_session() as db:
                new_report = BehavioralReport(
                    user_id=user_id,
                    title=report_title,
                    period_start=start_d,
                    period_end=end_d,
                    content=generated_text
                )
                db.add(new_report)
                await db.commit()
                await db.refresh(new_report)
            return {"status": "success", "report": new_report}
    except Exception as e:
        print("BG report failed:", e)
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

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
        report_title = "Какие события чаще всего повторяются в моей жизни?"
        report_prompt = f"""Ты выступаешь в роли профессионального психолога-аналитика.
Твоя задача: найти повторяющиеся паттерны событий в жизни пользователя на основе его дневника и сопоставить их с его портретом личности.
Портрет личности пользователя:
{portrait.content}

Записи дневника:
{entries_text}

Создай глубокий, живой, динамичный и точный отчет, обращаясь к пользователю на "Вы".
ВАЖНОЕ ТРЕБОВАНИЕ: Этот отчет обязан отвечать на вопрос "{report_title}", а не просто давать произвольный анализ. В отчете должно быть МИНИМУМ рекомендаций, ТОЛЬКО глубокий анализ.

Структура отчета (используй Markdown-разметку, как в портрете личности, с заголовками h2, жирным текстом и маркированными списками):
1. **Главный паттерн**: Самое яркое повторяющееся событие или реакция.
2. **Как это связано с вашим Портретом**: Почему именно так вы реагируете (со ссылкой на черты личности из Портрета).
3. **Краткий вывод**: Один-два предложения анализа (без списков рекомендаций).

СТРОГОЕ ПРАВИЛО ФОРМАТИРОВАНИЯ:
Формируй ответ СТРОГО в виде аналитического отчета. КАТЕГОРИЧЕСКИ ЗАПРЕЩАЕТСЯ использовать диалоговые клише, приветствия и прощания, такие как 'Заключение', 'Могу вам предложить', 'Вот ваш отчет', 'Здравствуйте', 'Если у вас есть вопросы' и любые обращения к пользователю вне контекста анализа. Текст должен быть самодостаточным, объективным и структурированным, начинаться сразу с заголовка отчета и заканчиваться последним пунктом плана, без попыток завязать диалог.
Пиши интересно, без воды, показывай динамику."""
    elif req.report_type == 'effective_reactions':
        report_title = "На какие ситуации я реагирую эффективно, а на какие нет?"
        report_prompt = f"""Ты выступаешь в роли профессионального психолога-аналитика.
Твоя задача: оценить эффективность реакций пользователя на различные жизненные ситуации на основе его дневника и портрета личности.
Портрет личности пользователя:
{portrait.content}

Записи дневника:
{entries_text}

Создай глубокий, живой, динамичный и точный отчет, обращаясь к пользователю на "Вы".
ВАЖНОЕ ТРЕБОВАНИЕ: Этот отчет обязан отвечать на вопрос "{report_title}", а не просто давать произвольный анализ. В отчете должно быть МИНИМУМ рекомендаций, ТОЛЬКО глубокий анализ.

Структура отчета (используй Markdown-разметку, как в портрете личности, с заголовками h2, жирным текстом и маркированными списками):
1. **Зоны эффективности**: В каких ситуациях (дни, события) ваша реакция была максимально конструктивной.
2. **Зоны роста**: Где ваши автоматические реакции мешают вам, исходя из вашего Портрета личности.
3. **Краткий вывод**: Один-два предложения анализа (без списков рекомендаций).

СТРОГОЕ ПРАВИЛО ФОРМАТИРОВАНИЯ:
Формируй ответ СТРОГО в виде аналитического отчета. КАТЕГОРИЧЕСКИ ЗАПРЕЩАЕТСЯ использовать диалоговые клише, приветствия и прощания, такие как 'Заключение', 'Могу вам предложить', 'Вот ваш отчет', 'Здравствуйте', 'Если у вас есть вопросы' и любые обращения к пользователю вне контекста анализа. Текст должен быть самодостаточным, объективным и структурированным, начинаться сразу с заголовка отчета и заканчиваться последним пунктом плана, без попыток завязать диалог.
Пиши интересно, без воды, показывай динамику."""
    else:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Неизвестный тип отчета.")

    ai_token = os.getenv("TIMEWEB_AI_REPORTS_TOKEN", os.getenv("TIMEWEB_AI_TOKEN"))
    ai_url = os.getenv("TIMEWEB_AI_REPORTS_URL", os.getenv("TIMEWEB_AI_URL"))
    
    if not ai_url:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="AI URL not configured")
        
    if not ai_url.endswith("/chat/completions"):
        ai_url = ai_url.rstrip("/") + "/chat/completions"
        
    if not ai_token:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="AI token not configured")

    task = asyncio.create_task(_generate_report_bg(user_id, report_title, report_prompt, start_d, end_d, ai_url, ai_token, len(entries)))
    try:
        result = await asyncio.shield(task)
        # Wait, the BG task returns a dict with "status": "success", "report": <BehavioralReport>
        # but the BehavioralReport model might not be serializable if the session is closed!
        # Ah! `new_report` is returned from a closed session!
        # This will raise DetachedInstanceError when FastAPI tries to serialize it!
        # Let's return the dictionary directly from the shield or parse it.
        if result["status"] == "success":
            r = result["report"]
            return {
                "id": r.id,
                "title": r.title,
                "period_start": r.period_start,
                "period_end": r.period_end,
                "content": r.content,
                "created_at": r.created_at
            }
        return result
    except asyncio.CancelledError:
        raise

async def _analyze_reaction_bg(user_id: int, entry_id: int):
    import os
    import httpx
    import re
    from fastapi import HTTPException
    from backend.database import async_session
    from backend.database.models import DiaryEntry, PersonalityPortrait
    from sqlalchemy import select
    
    try:
        ai_token = os.getenv("TIMEWEB_AI_SCALE_TOKEN", os.getenv("TIMEWEB_AI_TOKEN"))
        ai_url = os.getenv("TIMEWEB_AI_SCALE_URL", os.getenv("TIMEWEB_AI_URL"))
        
        if not ai_url:
            print("TIMEWEB_AI_URL is not set")
            return
            
        if not ai_url.endswith("/chat/completions"):
            ai_url = ai_url.rstrip("/") + "/chat/completions"
            
        if not ai_token:
            print("TIMEWEB_AI_TOKEN is not set")
            return
            
        async with async_session() as db:
            entry = (await db.execute(select(DiaryEntry).where(DiaryEntry.id == entry_id, DiaryEntry.user_id == user_id))).scalars().first()
            if not entry:
                return
                
            portrait = (await db.execute(select(PersonalityPortrait).where(PersonalityPortrait.user_id == user_id))).scalars().first()
            if not portrait:
                return
            portrait_text = portrait.technical_summary if portrait.technical_summary else portrait.content
            
            prompt = f"""Ты — ИИ-психолог.
Ниже представлен психологический портрет пользователя:
{portrait_text}

Пользователь описал свою ситуацию:
"{entry.event}"

И свою реакцию на нее:
"{entry.reaction}"

Оцени от 0 до 100, насколько эта реакция соответствует описанному портрету личности (где 0 - совершенно нетипично, 100 - полностью соответствует портрету).
Также напиши короткое объяснение (до 3 предложений), почему ты поставил такую оценку.
ВАЖНО: Пиши объяснение от первого лица, обращаясь к пользователю напрямую (на "ты"), как если бы ты вел с ним диалог. Например: "Твоя реакция очень показательна..." или "В этой ситуации ты повел себя...". НЕ используй третье лицо ("пользователь", "он").
ЕСЛИ ситуация или реакция содержит бред, спам, бессмысленный набор букв, что-то абсолютно нереалистичное, неадекватное или странное, то верни в поле explanation строго строку "..." (без кавычек), а score сделай 0.

Верни ответ СТРОГО в формате JSON:
{{
  "score": <число от 0 до 100>,
  "explanation": "<твое объяснение до 3 предложений, либо '...' если текст неадекватный>"
}}"""

            async with httpx.AsyncClient(timeout=30.0) as client:
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
                        ],
                        "response_format": {"type": "json_object"}
                    }
                )
                
                if ai_response.status_code == 404:
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
                            ],
                            "response_format": {"type": "json_object"}
                        }
                    )
                    
                ai_response.raise_for_status()
                ai_data = ai_response.json()
                generated_text = ai_data["choices"][0]["message"]["content"].strip()
                
                import json
                try:
                    clean_text = generated_text.replace('```json', '').replace('```', '').strip()
                    parsed = json.loads(clean_text)
                    score = int(parsed.get("score", 50))
                    explanation = parsed.get("explanation", "")
                except Exception:
                    numbers = re.findall(r'\d+', generated_text)
                    if numbers:
                        score = int(numbers[0])
                    else:
                        score = 50
                    explanation = generated_text
                    
                score = max(0, min(100, score))
                    
                entry.portrait_match_score = score
                entry.portrait_match_explanation = explanation
                await db.commit()
                return {"score": score, "explanation": explanation}
                
    except Exception as e:
        print("BG analyze reaction failed:", e)

@app.post("/api/analyze-reaction/{entry_id}")
async def analyze_reaction(
    entry_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    import asyncio
    user_id = user_data.get("id")
    
    # Just run it directly since it's triggered manually
    result = await _analyze_reaction_bg(user_id, entry_id)
    if result is not None:
        return {"status": "success", "score": result["score"], "explanation": result["explanation"]}
    else:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="Failed to analyze reaction")

from pydantic import BaseModel
from typing import List

class SubmitTestRequest(BaseModel):
    answer_ids: List[int]

@app.get("/api/tests/{test_id}")
async def get_test_details(
    test_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    query = select(Test).options(
        selectinload(Test.questions).selectinload(Question.answers)
    ).where(Test.id == test_id)
    test = (await session.execute(query)).scalar_one_or_none()
    
    if not test:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Тест не найден")
    
    user_id = user_data.get("id")
    progress_query = select(Progress).where(Progress.test_id == test_id, Progress.user_id == user_id)
    progress = (await session.execute(progress_query)).scalar_one_or_none()
    
    return {
        "id": test.id,
        "name": test.name,
        "description": test.description,
        "passed": bool(progress),
        "questions": [
            {
                "id": q.id,
                "name": q.name,
                "answers": [
                    {
                        "id": a.id,
                        "name": a.name,
                    } for a in q.answers
                ]
            } for q in test.questions
        ]
    }

@app.post("/api/tests/{test_id}/submit")
async def submit_test(
    test_id: int,
    payload: SubmitTestRequest,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    # check if already passed
    progress_query = select(Progress).where(Progress.test_id == test_id, Progress.user_id == user_id)
    progress = (await session.execute(progress_query)).scalar_one_or_none()
    if progress:
        return {"result": "Вы уже прошли этот тест."}
    
    # get test
    query = select(Test).where(Test.id == test_id)
    test = (await session.execute(query)).scalar_one_or_none()
    
    if not test:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Тест не найден")
        
    # get answers
    answers_query = select(Answer).where(Answer.id.in_(payload.answer_ids))
    answers = (await session.execute(answers_query)).scalars().all()
    
    if test.hardcode_test:
        result_text = get_hardcoded_test_result(answers, test)
        progress = Progress(
            test_id=test_id,
            user_id=user_id,
            value=0,
            hardcode_value=result_text
        )
        session.add(progress)
    else:
        points = sum((a.value or 0) for a in answers)
        result_query = select(Result).where(
            Result.test_id == test_id,
            Result.range_from <= points,
            (Result.range_to >= points) | (Result.range_to.is_(None))
        )
        result_obj = (await session.execute(result_query)).scalar_one_or_none()
        
        progress = Progress(
            test_id=test_id,
            user_id=user_id,
            value=points
        )
        session.add(progress)
        result_text = result_obj.name if result_obj and result_obj.name else "Результат не найден"
        
    await session.commit()
    return {"result": result_text}

@app.get("/api/admin/stats")
async def get_admin_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    unique: bool = False,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    import traceback
    try:
        from fastapi import HTTPException
        from sqlalchemy import or_
        
        username = user_data.get("username", "")
        if username not in ['ingenfrid', 'key_crp', 'fondlife']:
            raise HTTPException(status_code=403, detail="Access denied")

        start_dt = None
        end_dt = None
        if start_date:
            start_dt = datetime.fromisoformat(start_date)
        if end_date:
            end_dt = datetime.fromisoformat(end_date)
            
        def apply_filters(query, model):
            if start_dt:
                query = query.where(model.created_at >= start_dt)
            if end_dt:
                query = query.where(model.created_at <= end_dt)
            return query
            
        def get_count_expr(model):
            if unique:
                return func.count(func.distinct(model.user_id))
            return func.count(model.id)

        diary_q = select(get_count_expr(DiaryEntry))
        diary_q = apply_filters(diary_q, DiaryEntry)
        diary_count = (await session.execute(diary_q)).scalar() or 0
        
        # New counters
        users_count_q = select(get_count_expr(User))
        users_count_q = apply_filters(users_count_q, User)
        total_users = (await session.execute(users_count_q)).scalar() or 0
        
        active_users_q = select(get_count_expr(User)).where(User.has_opened_app == True)
        active_users_q = apply_filters(active_users_q, User)
        active_users = (await session.execute(active_users_q)).scalar() or 0
        
        reports_q = select(get_count_expr(BehavioralReport))
        reports_q = apply_filters(reports_q, BehavioralReport)
        reports_count = (await session.execute(reports_q)).scalar() or 0
        
        portraits_q = select(get_count_expr(PersonalityPortrait))
        portraits_q = apply_filters(portraits_q, PersonalityPortrait)
        portraits_count = (await session.execute(portraits_q)).scalar() or 0
        
        cats_query = select(Category).options(joinedload(Category.tests))
        categories = (await session.execute(cats_query)).scalars().unique().all()
        
        test_counts = []
        for cat in categories:
            cat_data = {"id": cat.id, "name": cat.name, "tests": []}
            for t in cat.tests:
                prog_q = select(get_count_expr(Progress)).where(Progress.test_id == t.id)
                prog_q = apply_filters(prog_q, Progress)
                prog_q = prog_q.where(or_(Progress.value.isnot(None), Progress.hardcode_value.isnot(None)))
                
                count = (await session.execute(prog_q)).scalar() or 0
                cat_data["tests"].append({
                    "id": t.id,
                    "name": t.name,
                    "count": count
                })
            test_counts.append(cat_data)
            
        return {
            "total_users": total_users,
            "active_users": active_users,
            "diary_entries": diary_count,
            "reports_generated": reports_count,
            "portraits_generated": portraits_count,
            "tests": test_counts
        }
    except Exception as e:
        with open("admin_error.txt", "w", encoding="utf-8") as f:
            f.write(traceback.format_exc())
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))

from typing import Optional

class AnswerCreate(BaseModel):
    name: str
    value: int

class QuestionCreate(BaseModel):
    name: str
    answers: List[AnswerCreate]

class ResultCreate(BaseModel):
    name: str
    range_from: int
    range_to: Optional[int] = None

class TestCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category_id: int
    questions: List[QuestionCreate]
    results: List[ResultCreate]

@app.get("/api/admin/tests/{test_id}")
async def get_admin_test_details(
    test_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    from fastapi import HTTPException
    username = user_data.get("username", "")
    if username not in ['ingenfrid', 'key_crp', 'fondlife']:
        raise HTTPException(status_code=403, detail="Access denied")
        
    query = select(Test).options(
        selectinload(Test.questions).selectinload(Question.answers),
        selectinload(Test.results)
    ).where(Test.id == test_id)
    test = (await session.execute(query)).scalar_one_or_none()
    
    if not test:
        raise HTTPException(status_code=404, detail="Тест не найден")
        
    return {
        "id": test.id,
        "name": test.name,
        "description": test.description,
        "category_id": test.category_id,
        "results": [
            {
                "id": r.id,
                "name": r.name,
                "range_from": r.range_from,
                "range_to": r.range_to
            } for r in test.results
        ],
        "questions": [
            {
                "id": q.id,
                "name": q.name,
                "answers": [
                    {
                        "id": a.id,
                        "name": a.name,
                        "value": a.value
                    } for a in q.answers
                ]
            } for q in test.questions
        ]
    }

@app.post("/api/admin/tests")
async def create_admin_test(
    payload: TestCreate,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    from fastapi import HTTPException
    username = user_data.get("username", "")
    if username not in ['ingenfrid', 'key_crp', 'fondlife']:
        raise HTTPException(status_code=403, detail="Access denied")
        
    new_test = Test(
        name=payload.name,
        description=payload.description,
        category_id=payload.category_id,
        free=True,
    )
    session.add(new_test)
    await session.flush()
    
    for r in payload.results:
        session.add(Result(test_id=new_test.id, name=r.name, range_from=r.range_from, range_to=r.range_to))
        
    for q in payload.questions:
        new_q = Question(test_id=new_test.id, name=q.name)
        session.add(new_q)
        await session.flush()
        for a in q.answers:
            session.add(Answer(question_id=new_q.id, name=a.name, value=a.value))
            
    await session.commit()
    return {"status": "ok", "test_id": new_test.id}

@app.put("/api/admin/tests/{test_id}")
async def update_admin_test(
    test_id: int,
    payload: TestCreate,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    from fastapi import HTTPException
    username = user_data.get("username", "")
    if username not in ['ingenfrid', 'key_crp', 'fondlife']:
        raise HTTPException(status_code=403, detail="Access denied")
        
    query = select(Test).where(Test.id == test_id)
    test = (await session.execute(query)).scalar_one_or_none()
    
    if not test:
        raise HTTPException(status_code=404, detail="Тест не найден")
        
    test.name = payload.name
    test.description = payload.description
    test.category_id = payload.category_id
    
    from sqlalchemy import delete
    await session.execute(delete(Question).where(Question.test_id == test_id))
    await session.execute(delete(Result).where(Result.test_id == test_id))
    await session.flush()
    
    for r in payload.results:
        session.add(Result(test_id=test_id, name=r.name, range_from=r.range_from, range_to=r.range_to))
        
    for q in payload.questions:
        new_q = Question(test_id=test_id, name=q.name)
        session.add(new_q)
        await session.flush()
        for a in q.answers:
            session.add(Answer(question_id=new_q.id, name=a.name, value=a.value))
            
    await session.commit()
    return {"status": "ok"}

@app.delete("/api/tests/{test_id}/progress")
async def delete_test_progress(
    test_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    from sqlalchemy import delete
    await session.execute(delete(Progress).where(Progress.test_id == test_id, Progress.user_id == user_id))
    await session.commit()
    return {"status": "ok"}

@app.delete("/api/admin/tests/{test_id}")
async def delete_admin_test(
    test_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    from fastapi import HTTPException
    username = user_data.get("username", "")
    if username not in ['ingenfrid', 'key_crp', 'fondlife']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    test = await session.get(Test, test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
        
    from sqlalchemy import delete
    from backend.database.models import Progress, Result
    await session.execute(delete(Progress).where(Progress.test_id == test_id))
    await session.execute(delete(Result).where(Result.test_id == test_id))
        
    await session.delete(test)
    await session.commit()
    return {"status": "success"}



from sqlalchemy import or_, and_

@app.get("/api/users/search")
async def search_users(
    q: str,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    q = q.lstrip('@')
    if not q or len(q) < 2:
        return []
    
    # Search by username, excluding self
    query = select(User).where(
        User.id != user_id,
        User.username.ilike(f"%{q}%")
    ).limit(20)
    
    users = (await session.execute(query)).scalars().all()
    
    result = []
    for u in users:
        result.append({
            "id": u.id,
            "username": u.username,
            "first_name": u.tg_first_name,
            "photo_url": u.photo_url
        })
    return result

@app.get("/api/friends")
async def get_friends(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    
    # Get all friendships where user is involved
    query = select(Friendship).where(
        or_(Friendship.user_id == user_id, Friendship.friend_id == user_id)
    )
    friendships = (await session.execute(query)).scalars().all()
    
    friends = []
    incoming_requests = []
    outgoing_requests = []
    
    for f in friendships:
        if f.status == "accepted":
            other_id = f.friend_id if f.user_id == user_id else f.user_id
            other_user = await session.get(User, other_id)
            if other_user:
                friends.append({
                    "id": other_user.id,
                    "friendship_id": f.id,
                    "username": other_user.username,
                    "first_name": other_user.tg_first_name,
                    "photo_url": other_user.photo_url
                })
        elif f.status == "pending":
            if f.friend_id == user_id:
                # incoming request
                other_user = await session.get(User, f.user_id)
                if other_user:
                    incoming_requests.append({
                        "id": other_user.id,
                        "request_id": f.id,
                        "username": other_user.username,
                        "first_name": other_user.tg_first_name,
                        "photo_url": other_user.photo_url
                    })
            else:
                # outgoing request
                other_user = await session.get(User, f.friend_id)
                if other_user:
                    outgoing_requests.append({
                        "id": other_user.id,
                        "request_id": f.id,
                        "username": other_user.username,
                        "first_name": other_user.tg_first_name,
                        "photo_url": other_user.photo_url
                    })
                
    return {
        "friends": friends,
        "incoming_requests": incoming_requests,
        "outgoing_requests": outgoing_requests
    }

@app.post("/api/friends/request/{target_id}")
async def send_friend_request(
    target_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    if user_id == target_id:
        return {"status": "error", "message": "Cannot add yourself"}
        
    target_user = await session.get(User, target_id)
    if not target_user:
        return {"status": "error", "message": "User not found"}
        
    # Check if exists
    query = select(Friendship).where(
        or_(
            and_(Friendship.user_id == user_id, Friendship.friend_id == target_id),
            and_(Friendship.user_id == target_id, Friendship.friend_id == user_id)
        )
    )
    existing = (await session.execute(query)).scalars().first()
    if existing:
        return {"status": "error", "message": "Request or friendship already exists"}
        
    new_f = Friendship(user_id=user_id, friend_id=target_id, status="pending")
    session.add(new_f)
    await session.commit()
    return {"status": "success"}

@app.post("/api/friends/accept/{request_id}")
async def accept_friend_request(
    request_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    f = await session.get(Friendship, request_id)
    if not f or f.friend_id != user_id or f.status != "pending":
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid request")
        
    f.status = "accepted"
    await session.commit()
    return {"status": "success"}

@app.post("/api/friends/reject/{request_id}")
async def reject_friend_request(
    request_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    f = await session.get(Friendship, request_id)
    if not f:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not found")
        
    if f.friend_id != user_id and f.user_id != user_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
        
    await session.delete(f)
    await session.commit()
    return {"status": "success"}

@app.delete("/api/friends/{friend_id}")
async def delete_friend(
    friend_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    
    query = select(Friendship).where(
        and_(
            Friendship.status == "accepted",
            or_(
                and_(Friendship.user_id == user_id, Friendship.friend_id == friend_id),
                and_(Friendship.user_id == friend_id, Friendship.friend_id == user_id)
            )
        )
    )
    f = (await session.execute(query)).scalars().first()
    if not f:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Friendship not found")
        
    await session.delete(f)
    await session.commit()
    return {"status": "success"}
