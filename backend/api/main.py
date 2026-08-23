import asyncio
import os
from datetime import datetime
from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from backend.api.security import validate_twa_data
from sqlalchemy.orm import selectinload, joinedload
from backend.database import async_session
from backend.database.models import User, Category, Test, Question, Answer, Progress, Result, DiaryEntry, PersonalityPortrait, BehavioralReport, Friendship
from backend.telegram.views.hardcoded_tests import get_hardcoded_test_result


async def generate_technical_summary_bg(user_id: int, generated_text: str):
    import os
    import httpx
    from backend.database import async_session
    from backend.database.models import PersonalityPortrait
    from sqlalchemy import select
    
    ai_scale_token = os.getenv("TIMEWEB_AI_SCALE_TOKEN", os.getenv("TIMEWEB_AI_TOKEN"))
    ai_scale_url = os.getenv("TIMEWEB_AI_SCALE_URL", os.getenv("TIMEWEB_AI_URL"))
    if ai_scale_url and not ai_scale_url.endswith("/chat/completions"):
        ai_scale_url = ai_scale_url.rstrip("/") + "/chat/completions"
        
    if ai_scale_url and ai_scale_token:
        summary_prompt = f"""Оригинальный текст психологического портрета:\n{generated_text}\n\nЗадание:\nНапиши техническую выжимку ВСЕХ интерпретаций из портрета выше. Дословно перенеси смыслы всех результатов, но в максимально сокращенном формате (используй сухие факты, списки, аббревиатуры). Никакая информация не должна быть утеряна, но она должна быть максимально сжата. Текст не обязательно должен быть легко читаемым для человека, но обязан быть 100% понятным для ИИ, так как он будет использоваться как контекст личности.\nВыведи ТОЛЬКО текст выжимки, без вступлений."""
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                ai_summary_response = await client.post(
                    ai_scale_url,
                    headers={"Authorization": f"Bearer {ai_scale_token}", "Content-Type": "application/json"},
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [{"role": "user", "content": summary_prompt}]
                    }
                )
                if ai_summary_response.status_code == 200:
                    ai_summary_data = ai_summary_response.json()
                    technical_summary = ai_summary_data["choices"][0]["message"]["content"].strip()
                    
                    async with async_session() as db:
                        existing = (await db.execute(select(PersonalityPortrait).where(PersonalityPortrait.user_id == user_id))).scalars().first()
                        if existing:
                            existing.technical_summary = technical_summary
                            await db.commit()
        except Exception as sum_e:
            print("Failed to generate technical summary:", sum_e)

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
            db_user.first_opened_at = datetime.utcnow()
            changed = True
            
        start_param = user_data.get("start_param")
        if start_param and start_param.startswith("invite_"):
            invited_id = start_param.replace("invite_", "")
            if not db_user.invited_id and str(db_user.id) != invited_id:
                db_user.invited_id = invited_id
                changed = True

        if changed:
            await session.commit()
            
    access_level = "Free"
    access_expires_at = None
    
    now = datetime.utcnow()
    if db_user:
        if db_user.premium_until and db_user.premium_until > now:
            access_level = "Premium"
            access_expires_at = db_user.premium_until.isoformat()
        elif db_user.first_opened_at and db_user.first_opened_at + timedelta(days=7) > now:
            access_level = "Демо-доступ"
            access_expires_at = (db_user.first_opened_at + timedelta(days=7)).isoformat()
    
    # Получаем все категории и тесты
    cats_query = select(Category).options(joinedload(Category.tests))
    categories = (await session.execute(cats_query)).scalars().unique().all()
    categories = sorted(categories, key=lambda c: 1 if c.name.lower() == "профориентация" else 0)
    
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

    # Формируем ответ для React
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
            "tests_count": portrait_obj.tests_count
        }
        
    return {
        "categories": result_data,
        "total_tests": total_tests,
        "passed_tests": passed_tests,
        "portrait": portrait_data,
        "access_level": access_level,
        "access_expires_at": access_expires_at,
        "has_career_access": db_user.has_career_access if db_user else False,
        "has_active_subscription": bool(db_user and db_user.yookassa_payment_method_id)
    }

async def check_access(user_id: int, session: AsyncSession):
    from datetime import datetime, timedelta
    from fastapi import HTTPException
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=403, detail="User not found")
    now = datetime.utcnow()
    if user.premium_until and user.premium_until > now:
        return
    if user.first_opened_at and user.first_opened_at + timedelta(days=7) > now:
        return
    raise HTTPException(status_code=403, detail="Для доступа к этой функции необходим Демо-доступ или Premium подписка.")

# Эндпоинт 2: Получение записей дневника за месяц
@app.get("/api/diary")
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
    
    has_premium_access = True
    try:
        await check_access(user_id, session)
    except:
        has_premium_access = False
    
    return [
        {
            "id": e.id, 
            "date": e.date.isoformat(), 
            "event": e.event, 
            "reaction": e.reaction, 
            "rating": getattr(e, "rating", None), 
            "portrait_match_score": getattr(e, "portrait_match_score", None) if has_premium_access else None,
            "portrait_match_explanation": getattr(e, "portrait_match_explanation", None) if has_premium_access else None
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
    from backend.database.models import PersonalityPortrait, PortraitLog
    from sqlalchemy import select
    
    # Добавляем инструкции для JSON формата и технического саммари
    prompt += '\n\nВАЖНО: В поле description напиши до 3 предложений пояснения, почему ты выбрал именно такое % соответствия на этой шкале.'
    prompt += '\n\nВыведи только красивый Markdown текст (включая блок с ```json внутри для шкал). Без дополнительных вступлений.'

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            ai_response = await client.post(
                ai_url,
                headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                json={
                    "model": "claude-3.5-sonnet",
                    "messages": [{"role": "user", "content": prompt}]
                }
            )
            
            if ai_response.status_code == 404:
                ai_response = await client.post(
                    ai_url,
                    headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                    json={
                        "model": "claude-3.5-sonnet",
                        "messages": [{"role": "user", "content": prompt}]
                    }
                )
            if ai_response.status_code != 200:
                print(f"ERROR FROM TIMEWEB API PORTRAIT: {ai_response.text}")
                return {"status": "error", "message": f"Ошибка AI провайдера: {ai_response.text}"}
                
            ai_response.raise_for_status()
            ai_data = ai_response.json()
            generated_text = ai_data["choices"][0]["message"]["content"].strip()
            
            content = generated_text
            technical_summary = ""
            
            # Фоновая задача: мы больше не ждем gpt-4o-mini здесь
            # Запускаем ее отдельно или вообще в другом месте
            

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
                
                # Записываем генерацию в лог для не-уникальной статистики
                db.add(PortraitLog(user_id=user_id))
                
                await db.commit()
                await db.refresh(new_portrait)
                
            # Запускаем фоновую генерацию технической выжимки
            import asyncio
            asyncio.create_task(generate_technical_summary_bg(user_id, content))
            
            return {"status": "success", "portrait": new_portrait}
    except Exception as e:
        import traceback
        traceback.print_exc()
        print("BG portrait failed:", repr(e))
        raise HTTPException(status_code=500, detail=f"Failed to generate portrait: {repr(e)}")

@app.post("/api/portrait/generate")
async def generate_personality_portrait(
    background_tasks: BackgroundTasks,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    import os
    import httpx
    
    user_id = user_data.get("id")
    await check_access(user_id, session)
    
    # 1. Получаем результаты всех тестов
    prog_query = select(Progress).where(Progress.user_id == user_id).options(joinedload(Progress.test))
    progresses = (await session.execute(prog_query)).scalars().all()
    
    career_cat = (await session.execute(select(Category).where(Category.name == "Профориентация"))).scalars().first()
    if career_cat:
        total_tests = (await session.execute(select(func.count(Test.id)).where(Test.category_id != career_cat.id))).scalar()
    else:
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
        
    # Запускаем генерацию в фоне и сразу возвращаем ответ
    background_tasks.add_task(_generate_portrait_bg, user_id, total_tests, prompt, ai_url, ai_token)
    return {"status": "generating"}

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
        "created_at": r.created_at,
        "is_read": r.is_read
    } for r in reports]

@app.post("/api/reports/{report_id}/read")
async def mark_report_read(
    report_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    report = await session.get(BehavioralReport, report_id)
    if not report or report.user_id != user_id:
        raise HTTPException(status_code=404, detail="Отчет не найден")
    
    if not report.is_read:
        report.is_read = True
        await session.commit()
    
    return {"status": "ok"}


async def _generate_report_bg(user_id: int, report_title: str, report_prompt: str, start_d, end_d, ai_url: str, ai_token: str, num_entries: int):
    import httpx
    from fastapi import HTTPException
    from backend.database import async_session
    from backend.database.models import BehavioralReport
    try:
        payload = {
            "model": "claude-3.5-sonnet",
            "messages": [{"role": "user", "content": report_prompt}]
        }
        print(f"--- Отправка запроса к ИИ ({payload['model']}) ---")
        print(f"URL: {ai_url}")
        print(f"Записей дневника передано: {num_entries}")
        print("-------------------------------------------------", flush=True)

        async with httpx.AsyncClient(timeout=90.0) as client:
            ai_response = await client.post(
                ai_url,
                headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                json=payload
            )
            
            if ai_response.status_code == 404:
                payload["model"] = "claude-3.5-sonnet"
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
        import traceback
        traceback.print_exc()
        print("BG report failed:", repr(e))
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {repr(e)}")

@app.delete("/api/reports/{report_id}")
async def delete_report(
    report_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    query = select(BehavioralReport).where(BehavioralReport.id == report_id, BehavioralReport.user_id == user_id)
    report = (await session.execute(query)).scalars().first()
    
    if not report:
        raise HTTPException(status_code=404, detail="Отчет не найден")
        
    await session.delete(report)
    await session.commit()
    
    return {"status": "success"}

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
    await check_access(user_id, session)
    
    if req.report_type in ["energy", "competence"]:
        user = await session.get(User, user_id)
        if not user or not user.has_career_access:
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="Для генерации этого отчета необходимо купить блок 'Профориентация'")
    
    # 1. Получаем контекст (портрет или тесты) в зависимости от типа отчета
    portrait = None
    test_results_text = ""
    
    if req.report_type in ['repeating_events', 'effective_reactions']:
        portrait_query = select(PersonalityPortrait).where(PersonalityPortrait.user_id == user_id)
        portrait = (await session.execute(portrait_query)).scalars().first()
        
        if not portrait:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Для формирования отчета сначала необходимо сформировать портрет личности.")
    elif req.report_type in ['energy', 'competence']:
        from backend.database.models import Progress, Result, Test, Category
        prog_query = (
            select(Progress)
            .join(Test, Progress.test_id == Test.id)
            .join(Category, Test.category_id == Category.id)
            .where(
                Progress.user_id == user_id,
                Category.name == "Профориентация"
            )
            .options(joinedload(Progress.test))
        )
        progresses = (await session.execute(prog_query)).scalars().all()
        
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
    elif req.report_type == 'energy':
        report_title = "Энергия"
        report_prompt = f"""Ты выступаешь в роли профессионального психолога-аналитика.
Твоя задача: проанализировать записи дневника и результаты тестов профориентации пользователя, чтобы понять, какие действия и задачи дают ему энергию, а какие забирают. Пользователь не ленивый, он просто может не знать, где его энергия умножается, а где теряется. От каких задач он забывает про время?
Результаты тестов:
{test_results_text}

Записи дневника:
{entries_text}

Создай глубокий, живой, динамичный и точный отчет, обращаясь к пользователю на "Вы".
ВАЖНОЕ ТРЕБОВАНИЕ: Этот отчет обязан отвечать на вопросы, связанные с генерацией и потерей энергии, а не просто давать произвольный анализ. В отчете должно быть МИНИМУМ рекомендаций, ТОЛЬКО глубокий анализ.

Структура отчета (используй Markdown-разметку, как в портрете личности, с заголовками h2, жирным текстом и маркированными списками):
1. **Источники энергии**: Действия, задачи или ситуации, от которых вы забываете про время и получаете приток сил.
2. **Пожиратели энергии**: Что именно забирает ваши силы и почему (с опорой на ваши результаты тестов).
3. **Краткий вывод**: Один-два предложения анализа (без списков рекомендаций).

СТРОГОЕ ПРАВИЛО ФОРМАТИРОВАНИЯ:
Формируй ответ СТРОГО в виде аналитического отчета. КАТЕГОРИЧЕСКИ ЗАПРЕЩАЕТСЯ использовать диалоговые клише, приветствия и прощания, такие как 'Заключение', 'Могу вам предложить', 'Вот ваш отчет', 'Здравствуйте', 'Если у вас есть вопросы' и любые обращения к пользователю вне контекста анализа. Текст должен быть самодостаточным, объективным и структурированным, начинаться сразу с заголовка отчета и заканчиваться последним пунктом плана, без попыток завязать диалог.
Пиши интересно, без воды, показывай динамику."""
    elif req.report_type == 'competence':
        report_title = "Чувство компетентности"
        report_prompt = f"""Ты выступаешь в роли профессионального психолога-аналитика.
Твоя задача: на основе дневника и результатов тестов показать пользователю его сильные стороны, маленькие и большие победы, а также ситуации, в которых он проявляет компетентность. Понимание своей стези подавляет страх, тревогу и неготовность к ответственности. Чувство компетентности есть у всех, оно состоит из побед, похвалы от людей и результатов, которые замечают. В этом сила пользователя.
Результаты тестов:
{test_results_text}

Записи дневника:
{entries_text}

Создай глубокий, живой, динамичный и точный отчет, обращаясь к пользователю на "Вы".
ВАЖНОЕ ТРЕБОВАНИЕ: Этот отчет обязан подсветить компетентность пользователя и его реальные победы, а не просто давать произвольный анализ. В отчете должно быть МИНИМУМ рекомендаций, ТОЛЬКО глубокий анализ.

Структура отчета (используй Markdown-разметку, как в портрете личности, с заголовками h2, жирным текстом и маркированными списками):
1. **Ваши победы и достижения**: В каких ситуациях вы проявили себя максимально компетентно (даже в мелочах).
2. **Ваша настоящая сила**: В чем заключается ваша уникальная компетентность, опираясь на ваши результаты тестов.
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
    
    async def stream_generator():
        try:
            # Yield space every 5 seconds to keep connection alive and bypass Cloudflare timeout
            while not task.done():
                yield b" "
                await asyncio.sleep(5)
                
            result = task.result()
            if result.get("status") == "success":
                r = result["report"]
                output = {
                    "id": r.id,
                    "title": r.title,
                    "period_start": r.period_start.isoformat() if r.period_start else None,
                    "period_end": r.period_end.isoformat() if r.period_end else None,
                    "content": r.content,
                    "created_at": r.created_at.isoformat() if r.created_at else None
                }
                import json
                yield json.dumps(output).encode("utf-8")
            else:
                import json
                yield json.dumps(result).encode("utf-8")
        except Exception as e:
            import json
            yield json.dumps({"detail": f"Ошибка генерации отчета: {repr(e)}"}).encode("utf-8")

    from fastapi.responses import StreamingResponse
    return StreamingResponse(stream_generator(), media_type="application/json", headers={"X-Accel-Buffering": "no"})

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
Также напиши короткое объяснение (до 4 предложений), почему ты поставил такую оценку, И обязательно дай рекомендацию о том, как пользователю стоило бы поступить в этой ситуации в соответствии с его портретом личности.
ВАЖНО: Пиши объяснение от первого лица, обращаясь к пользователю напрямую (на "ты"), как если бы ты вел с ним диалог. Например: "Твоя реакция очень показательна..." или "В этой ситуации ты повел себя...". НЕ используй третье лицо ("пользователь", "он"). Обязательно дай рекомендацию.
ЕСЛИ ситуация или реакция содержит бред, спам, бессмысленный набор букв, что-то абсолютно нереалистичное, неадекватное или странное, то верни в поле explanation строго строку "..." (без кавычек), а score сделай 0.

Верни ответ СТРОГО в формате JSON:
{{
  "score": <число от 0 до 100>,
  "explanation": "<твое объяснение и рекомендация (до 4-5 предложений в сумме), либо '...' если текст неадекватный>"
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
                        ]
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
                            ]
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
    await check_access(user_id, session)
    
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
        selectinload(Test.questions).selectinload(Question.answers),
        selectinload(Test.category)
    ).where(Test.id == test_id)
    test = (await session.execute(query)).scalar_one_or_none()
    
    if not test:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Тест не найден")
    
    user_id = user_data.get("id")
    
    if test.category and test.category.name == "Профориентация":
        user = await session.get(User, user_id)
        if not user or not user.has_career_access:
            raise HTTPException(status_code=403, detail="Для доступа к этому тесту необходимо купить блок 'Профориентация'")
            
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
    try:
        user_id = user_data.get("id")
        progress_query = select(Progress).where(Progress.test_id == test_id, Progress.user_id == user_id)
        progress = (await session.execute(progress_query)).scalars().first()
        if progress:
            return {"result": "Вы уже прошли этот тест."}
        
        query = select(Test).options(selectinload(Test.category)).where(Test.id == test_id)
        test = (await session.execute(query)).scalar_one_or_none()
        
        if not test:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Тест не найден")
            
        if test.category and test.category.name == "Профориентация":
            user = await session.get(User, user_id)
            if not user or not user.has_career_access:
                from fastapi import HTTPException
                raise HTTPException(status_code=403, detail="Для отправки этого теста необходимо купить блок 'Профориентация'")
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
            
            # Логируем прохождение для статистики
            from backend.database.models import ProgressLog
            session.add(ProgressLog(user_id=user_id, test_id=test_id))
        else:
            points = sum((a.value or 0) for a in answers)
            result_query = select(Result).where(
                Result.test_id == test_id,
                Result.range_from <= points,
                (Result.range_to >= points) | (Result.range_to.is_(None))
            )
            result_obj = (await session.execute(result_query)).scalars().first()
            
            progress = Progress(
                test_id=test_id,
                user_id=user_id,
                value=points
            )
            session.add(progress)
            
            # Логируем прохождение для статистики
            from backend.database.models import ProgressLog
            session.add(ProgressLog(user_id=user_id, test_id=test_id))
            result_text = result_obj.name if result_obj and result_obj.name else "Результат не найден"
            
        await session.commit()
        return {"result": result_text}
    except Exception as e:
        import traceback
        traceback.print_exc()
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="Internal Error")

class AdminGrantRequest(BaseModel):
    target_username: str
    grant_type: str  # "premium" or "career"

@app.post("/api/admin/grant")
async def admin_grant_access(
    req: AdminGrantRequest,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    # Verify caller is admin
    caller_query = select(User).where(User.id == user_id)
    caller = (await session.execute(caller_query)).scalars().first()
    
    if not caller or caller.username not in ['ingenfrid', 'key_crp', 'fondlife']:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
        
    # Find target user
    clean_username = req.target_username.strip("@")
    target_query = select(User).where(User.username.ilike(clean_username))
    target_user = (await session.execute(target_query)).scalars().first()
    
    if not target_user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")
        
    if req.grant_type == "premium":
        target_user.premium_until = datetime(2099, 1, 1)
    elif req.grant_type == "career":
        target_user.has_career_access = True
    else:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid grant type")
        
    await session.commit()
    return {"status": "success", "message": f"Granted {req.grant_type} to user @{target_user.username}"}

class AdminRevokeRequest(BaseModel):
    target_username: str
    revoke_type: str  # "premium" or "career"

@app.post("/api/admin/revoke")
async def admin_revoke_access(
    req: AdminRevokeRequest,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    # Verify caller is admin
    caller_query = select(User).where(User.id == user_id)
    caller = (await session.execute(caller_query)).scalars().first()
    
    if not caller or caller.username not in ['ingenfrid', 'key_crp', 'fondlife']:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
        
    # Find target user
    clean_username = req.target_username.strip("@")
    target_query = select(User).where(User.username.ilike(clean_username))
    target_user = (await session.execute(target_query)).scalars().first()
    
    if not target_user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")
        
    if req.revoke_type == "premium":
        target_user.premium_until = None
    elif req.revoke_type == "career":
        target_user.has_career_access = False
    else:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid revoke type")
        
    await session.commit()
    return {"status": "success", "message": f"Revoked {req.revoke_type} from user @{target_user.username}"}

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
                if getattr(model, "__name__", "") == "User":
                    return func.count(func.distinct(model.id))
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
        
        from backend.database.models import PortraitLog, ProgressLog
        if not unique:
            portraits_q = select(get_count_expr(PortraitLog))
            portraits_q = apply_filters(portraits_q, PortraitLog)
        else:
            portraits_q = select(get_count_expr(PersonalityPortrait))
            portraits_q = apply_filters(portraits_q, PersonalityPortrait)
        portraits_count = (await session.execute(portraits_q)).scalar() or 0
        
        # Referral users
        ref_q = select(get_count_expr(User)).where(User.inn_verified == True)
        ref_q = apply_filters(ref_q, User)
        referral_users = (await session.execute(ref_q)).scalar() or 0
        
        # Compatibility Reports
        from backend.database.models import CompatibilityReport
        compat_q = select(get_count_expr(CompatibilityReport))
        compat_q = apply_filters(compat_q, CompatibilityReport)
        compat_reports = (await session.execute(compat_q)).scalar() or 0

        # Reports by type
        reports_types = ['repeating_events', 'effective_reactions', 'energy', 'competence']
        reports_by_type_list = []
        for r_type in reports_types:
            r_title = ""
            r_name = ""
            if r_type == 'repeating_events': 
                r_title = 'Какие события чаще всего повторяются в моей жизни?'
                r_name = 'Повторяющиеся события'
            elif r_type == 'effective_reactions': 
                r_title = 'На какие ситуации я реагирую эффективно, а на какие нет?'
                r_name = 'Эффективные реакции'
            elif r_type == 'energy': 
                r_title = 'Энергия'
                r_name = 'Энергия'
            elif r_type == 'competence': 
                r_title = 'Чувство компетентности'
                r_name = 'Чувство компетентности'

            r_type_q = select(get_count_expr(BehavioralReport)).where(BehavioralReport.title == r_title)
            r_type_q = apply_filters(r_type_q, BehavioralReport)
            count = (await session.execute(r_type_q)).scalar() or 0
            
            reports_by_type_list.append({"type": r_type, "name": r_name, "count": count})
        
        cats_query = select(Category).options(joinedload(Category.tests))
        categories = (await session.execute(cats_query)).scalars().unique().all()
        
        test_counts = []
        for cat in categories:
            cat_data = {"id": cat.id, "name": cat.name, "tests": []}
            for t in cat.tests:
                if not unique:
                    prog_q = select(get_count_expr(ProgressLog)).where(ProgressLog.test_id == t.id)
                    prog_q = apply_filters(prog_q, ProgressLog)
                else:
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
            "reports_by_type": reports_by_type_list,
            "portraits_generated": portraits_count,
            "compat_reports_generated": compat_reports,
            "referral_users": referral_users,
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

class GrantDemoRequest(BaseModel):
    username_or_id: str
    days: int = 7

@app.post("/api/admin/grant_demo")
async def admin_grant_demo(
    request: GrantDemoRequest,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    from fastapi import HTTPException
    username = user_data.get("username", "")
    if username not in ['ingenfrid', 'key_crp', 'fondlife']:
        raise HTTPException(status_code=403, detail="Access denied")
        
    identifier = request.username_or_id.strip()
    
    target_user = None
    if identifier.isdigit():
        target_user = await session.get(User, int(identifier))
    
    if not target_user:
        q = select(User).where(User.username.ilike(identifier.lstrip('@')))
        target_user = (await session.execute(q)).scalars().first()
        
    if not target_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
        
    target_user.premium_until = datetime.utcnow() + timedelta(days=request.days)
    
    await session.commit()
    return {"status": "ok", "message": f"Демо-доступ (Premium) на {request.days} дней выдан пользователю {target_user.username or target_user.id}"}

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


from backend.database.models import TrackingLink

@app.get("/api/admin/tracking_links")
async def get_tracking_links(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    from fastapi import HTTPException
    from sqlalchemy import select, func
    username = user_data.get("username", "")
    if username not in ['ingenfrid', 'key_crp', 'fondlife']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    links_query = select(TrackingLink)
    links_result = await session.execute(links_query)
    links = links_result.scalars().all()
    
    result = []
    for link in links:
        count_query = select(func.count(User.id)).where(User.tracking_link_id == link.id)
        count_result = await session.execute(count_query)
        clicks_count = count_result.scalar() or 0
        
        result.append({
            "id": link.id,
            "name": link.name,
            "code": link.code,
            "clicks_count": clicks_count
        })
    return result

@app.post("/api/admin/tracking_links")
async def create_tracking_link(
    data: dict,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    from fastapi import HTTPException
    import random
    import string
    username = user_data.get("username", "")
    if username not in ['ingenfrid', 'key_crp', 'fondlife']:
        raise HTTPException(status_code=403, detail="Access denied")
        
    name = data.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
        
    code = ''.join(random.choices(string.ascii_letters + string.digits, k=10))
    
    new_link = TrackingLink(name=name, code=code)
    session.add(new_link)
    await session.commit()
    await session.refresh(new_link)
    
    return {"id": new_link.id, "name": new_link.name, "code": new_link.code, "clicks_count": 0}

@app.delete("/api/admin/tracking_links/{link_id}")
async def delete_tracking_link(
    link_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    from fastapi import HTTPException
    username = user_data.get("username", "")
    if username not in ['ingenfrid', 'key_crp', 'fondlife']:
        raise HTTPException(status_code=403, detail="Access denied")
        
    link = await session.get(TrackingLink, link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
        
    await session.delete(link)
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
    from backend.database.models import PersonalityPortrait, CompatibilityReport
    user_id = user_data.get("id")
    
    # Check if current user has portrait
    current_user_portrait = (await session.execute(select(PersonalityPortrait).where(PersonalityPortrait.user_id == user_id))).scalars().first()
    current_user_has_portrait = bool(current_user_portrait)
    
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
                # Check if other user has portrait
                other_portrait = (await session.execute(select(PersonalityPortrait).where(PersonalityPortrait.user_id == other_id))).scalars().first()
                has_portrait = bool(other_portrait)
                
                # Check if compatibility exists between these two
                compat_query = select(CompatibilityReport).where(
                    or_(
                        and_(CompatibilityReport.user_id == user_id, CompatibilityReport.friend_id == other_id),
                        and_(CompatibilityReport.user_id == other_id, CompatibilityReport.friend_id == user_id)
                    )
                )
                compat = (await session.execute(compat_query)).scalars().first()
                has_compatibility = bool(compat)
                
                friends.append({
                    "id": other_user.id,
                    "friendship_id": f.id,
                    "username": other_user.username,
                    "first_name": other_user.tg_first_name,
                    "photo_url": other_user.photo_url,
                    "has_portrait": has_portrait,
                    "has_compatibility": has_compatibility
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
        "outgoing_requests": outgoing_requests,
        "current_user_has_portrait": current_user_has_portrait
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

class VerifyInnRequest(BaseModel):
    inn: str

@app.get("/api/referral")
async def get_referral_info(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    query = select(User).where(User.id == user_id)
    user = (await session.execute(query)).scalars().first()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")
        
    # Count referrals
    ref_query = select(func.count(User.id)).where(User.invited_id == str(user_id))
    ref_count = (await session.execute(ref_query)).scalar() or 0
    
    return {
        "inn_verified": user.inn_verified,
        "inn": user.inn,
        "pending": user.referral_balance_pending or 0,
        "available": user.referral_balance_available or 0,
        "referral_count": ref_count,
        "link": f"https://t.me/abcofmebot?start=invite_{user_id}"
    }

@app.post("/api/referral/verify_inn")
async def verify_user_inn(
    payload: VerifyInnRequest,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    from fastapi import HTTPException
    from backend.integrations.fns.client import FNSClient
    
    user_id = user_data.get("id")
    
    is_self_employed = await FNSClient.check_self_employed(payload.inn)
    if not is_self_employed:
        raise HTTPException(status_code=400, detail="ИНН не принадлежит действующему самозанятому (НПД).")
        
    query = select(User).where(User.id == user_id)
    user = (await session.execute(query)).scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.inn = payload.inn
    user.inn_verified = True
    await session.commit()
    
    return {"status": "success", "message": "ИНН подтвержден"}

@app.post("/api/referral/withdraw")
async def withdraw_referral_balance(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    from fastapi import HTTPException
    from backend.integrations.fns.client import FNSClient
    
    user_id = user_data.get("id")
    query = select(User).where(User.id == user_id)
    user = (await session.execute(query)).scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if not user.inn_verified or not user.inn:
        raise HTTPException(status_code=403, detail="Требуется подтверждение статуса самозанятого")
        
    # Перепроверка статуса перед выводом
    is_self_employed = await FNSClient.check_self_employed(user.inn)
    if not is_self_employed:
        user.inn_verified = False
        await session.commit()
        raise HTTPException(status_code=400, detail="Статус самозанятого аннулирован. Вывод невозможен.")
        
    available = user.referral_balance_available or 0
    if available < 100:  # Minimum 100 rub withdrawal
        raise HTTPException(status_code=400, detail="Минимальная сумма вывода - 100 рублей")
        
    # Process payout via YooKassa for Self-Employed
    from backend.integrations.payment.yoo import _create_payout_self_employed
    try:
        status, payout_id = _create_payout_self_employed(
            amount=available, 
            inn=user.inn,
            description=f"Выплата по реферальной программе для {user_id}"
        )
        
        # Deduct balance
        user.referral_balance_available = 0
        await session.commit()
        
        return {"status": "success", "payout_id": payout_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class CompatibilityRequest(BaseModel):
    friend_id: int
    type: str
    my_gender: str
    friend_gender: str

async def _generate_compatibility_bg(user_id: int, friend_id: int, compat_type: str, my_gender: str, friend_gender: str, prompt: str, ai_url: str, ai_token: str):
    import httpx
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            ai_response = await client.post(
                ai_url,
                headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}]
                }
            )
            if ai_response.status_code == 404:
                ai_response = await client.post(
                    ai_url,
                    headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [{"role": "user", "content": prompt}]
                    }
                )
                
            if ai_response.status_code != 200:
                return {"status": "error", "message": "AI service error"}
                
            ai_data = ai_response.json()
            content = ai_data["choices"][0]["message"]["content"].strip()
        
        # Check if exists
        from sqlalchemy import select
        from backend.database.models import CompatibilityReport
        
        async with async_session() as db_session:
            existing = (await db_session.execute(select(CompatibilityReport).where(
                CompatibilityReport.user_id == user_id,
                CompatibilityReport.friend_id == friend_id
            ))).scalars().first()
            
            if existing:
                existing.content = content
                existing.compat_type = compat_type
                existing.my_gender = my_gender
                existing.friend_gender = friend_gender
                await db_session.commit()
            else:
                new_report = CompatibilityReport(
                    user_id=user_id,
                    friend_id=friend_id,
                    compat_type=compat_type,
                    my_gender=my_gender,
                    friend_gender=friend_gender,
                    content=content
                )
                db_session.add(new_report)
                await db_session.commit()
                
        return {"status": "success", "content": content}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": f"Ошибка генерации совместимости: {repr(e)}"}

@app.post("/api/friends/compatibility")
async def generate_compatibility(
    req: CompatibilityRequest,
    user_data: dict = Depends(validate_twa_data),
    db: AsyncSession = Depends(get_session)
):
    try:
        import httpx
        import os
        import asyncio
        from fastapi.responses import StreamingResponse
        user_id = user_data.get("id")
        await check_access(user_id, db)
        
        from backend.database.models import PersonalityPortrait
        friend_id = req.friend_id
        
        # Get portraits
        my_portrait = (await db.execute(select(PersonalityPortrait).where(PersonalityPortrait.user_id == user_id))).scalars().first()
        friend_portrait = (await db.execute(select(PersonalityPortrait).where(PersonalityPortrait.user_id == friend_id))).scalars().first()
        
        if not my_portrait or not friend_portrait:
            raise HTTPException(status_code=400, detail="Оба пользователя должны иметь портрет личности для анализа.")
            
        prompt = f"""Сравни два психологических портрета и напиши анализ совместимости.
Тип отношений: {'Дружеская' if req.type == 'friendly' else 'Партнерская'}
Пол пользователя 1 (я): {req.my_gender}
Пол пользователя 2 (друг): {req.friend_gender}

Портрет пользователя 1:
{my_portrait.content}

Портрет пользователя 2:
{friend_portrait.content}

Напиши подробный анализ совместимости. Опиши сильные стороны союза, возможные конфликты и дай рекомендации. Пиши так, как будто ты обращаешься к пользователю 1. Используй красивое форматирование Markdown (заголовки, списки). Не используй никаких вступлений, сразу выдавай результат анализа."""

        ai_token = os.getenv("TIMEWEB_AI_TOKEN")
        ai_url = os.getenv("TIMEWEB_AI_URL")
        
        if not ai_token or not ai_url:
            raise HTTPException(status_code=500, detail="AI service not configured")
            
        if not ai_url.endswith("/chat/completions"):
            ai_url = ai_url.rstrip("/") + "/chat/completions"

        task = asyncio.create_task(_generate_compatibility_bg(user_id, friend_id, req.type, req.my_gender, req.friend_gender, prompt, ai_url, ai_token))
        
        async def stream_generator():
            try:
                while not task.done():
                    yield b" "
                    await asyncio.sleep(3)
                    
                result = task.result()
                if result.get("status") == "success":
                    import json
                    yield json.dumps(result).encode("utf-8")
                else:
                    import json
                    yield json.dumps({"detail": result.get("message", "Unknown error")}).encode("utf-8")
            except Exception as e:
                import traceback
                traceback.print_exc()
                import json
                yield json.dumps({"detail": f"Ошибка генерации совместимости: {repr(e)}"}).encode("utf-8")

        return StreamingResponse(stream_generator(), media_type="application/json", headers={"X-Accel-Buffering": "no"})
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Внутренняя ошибка API: {repr(exc)}")

@app.get("/api/friends/compatibility/{friend_id}")
async def get_compatibility(
    friend_id: int,
    user_data: dict = Depends(validate_twa_data),
    db: AsyncSession = Depends(get_session)
):
    from backend.database.models import CompatibilityReport
    user_id = user_data.get("id")
    report = (await db.execute(select(CompatibilityReport).where(
        CompatibilityReport.user_id == user_id,
        CompatibilityReport.friend_id == friend_id
    ))).scalars().first()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
        
    return {"status": "success", "content": report.content}

@app.post("/api/subscription/buy")
async def buy_subscription(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    from backend.integrations.payment.yoo import _create_payment
    from backend.database.models import Payment
    user_id = user_data.get("id")
    
    # 149 RUB for 1 month Premium
    url, payment_id = await _create_payment(amount=149, chat_id=str(user_id), description="Premium подписка (1 месяц)", email="", save_payment_method=True)
    
    payment = Payment(
        user_id=user_id,
        uuid=payment_id,
        url=url,
        is_premium_subscription=True,
        is_recurring=False
    )
    session.add(payment)
    await session.commit()
    
    return {"url": url, "payment_id": payment_id}

@app.get("/api/subscription/status/{payment_uuid}")
async def check_subscription_status(
    payment_uuid: str,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    from backend.integrations.payment.yoo import _check_payment
    from backend.database.models import Payment, User
    from datetime import datetime, timedelta
    
    user_id = user_data.get("id")
    
    payment = (await session.execute(select(Payment).where(Payment.uuid == payment_uuid, Payment.user_id == user_id))).scalars().first()
    if not payment:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Payment not found")
        
    if payment.success:
        return {"status": "success"}
        
    meta, amount, payment_method_id = await _check_payment(payment_uuid)
    if meta is not False: # succeeded
        payment.success = True
        
        user = await session.get(User, user_id)
        
        # Extend premium_until
        now = datetime.utcnow()
        if user.premium_until and user.premium_until > now:
            user.premium_until += timedelta(days=30)
        else:
            user.premium_until = now + timedelta(days=30)
            
        if payment_method_id:
            user.yookassa_payment_method_id = payment_method_id
            
        # Referral logic
        if user.invited_id:
            try:
                inviter_id = int(user.invited_id)
                inviter = await session.get(User, inviter_id)
                if inviter:
                    inviter.referral_balance_pending += int(amount / 2)
            except ValueError:
                pass
                
        await session.commit()
        return {"status": "success"}
        
    return {"status": "pending"}

@app.post("/api/career/buy")
async def buy_career_guidance(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    from backend.integrations.payment.yoo import _create_payment
    from backend.database.models import Payment, Category
    user_id = user_data.get("id")
    
    await check_access(user_id, session) # Must have premium to buy
    
    # 1499 RUB for one-time
    url, payment_id = await _create_payment(amount=1499, chat_id=str(user_id), description="Блок Профориентация", email="", save_payment_method=False)
    
    cat_query = select(Category).where(Category.name == "Профориентация")
    cat = (await session.execute(cat_query)).scalars().first()
    
    payment = Payment(
        user_id=user_id,
        uuid=payment_id,
        url=url,
        is_premium_subscription=False,
        is_recurring=False,
        category_id=cat.id if cat else None
    )
    session.add(payment)
    await session.commit()
    
    return {"url": url, "payment_id": payment_id}

@app.get("/api/career/status/{payment_uuid}")
async def check_career_status(
    payment_uuid: str,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    from backend.integrations.payment.yoo import _check_payment
    from backend.database.models import Payment, User
    
    user_id = user_data.get("id")
    
    payment = (await session.execute(select(Payment).where(Payment.uuid == payment_uuid, Payment.user_id == user_id))).scalars().first()
    if not payment:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Payment not found")
        
    if payment.success:
        return {"status": "success"}
        
    meta, amount, _ = await _check_payment(payment_uuid)
    if meta is not False: # succeeded
        payment.success = True
        
        user = await session.get(User, user_id)
        user.has_career_access = True
            
        # Referral logic
        if user.invited_id:
            try:
                inviter_id = int(user.invited_id)
                inviter = await session.get(User, inviter_id)
                if inviter:
                    inviter.referral_balance_pending += int(amount / 2)
            except ValueError:
                pass
                
        await session.commit()
        return {"status": "success"}
        
    return {"status": "pending"}

from fastapi import Request
@app.post("/api/webhook/yookassa")
async def yookassa_webhook(request: Request, session: AsyncSession = Depends(get_session)):
    try:
        body = await request.json()
    except Exception:
        return {"status": "error"}
        
    event = body.get("event")
    if event == "payment.succeeded":
        payment_obj = body.get("object", {})
        payment_uuid = payment_obj.get("id")
        payment_method = payment_obj.get("payment_method", {})
        payment_method_id = payment_method.get("id") if payment_method.get("saved") else None
        
        from backend.database.models import Payment, User
        from sqlalchemy import select
        from datetime import datetime, timedelta
        
        payment = (await session.execute(select(Payment).where(Payment.uuid == payment_uuid))).scalars().first()
        if payment and not payment.success:
            payment.success = True
            user_id = payment.user_id
            user = await session.get(User, user_id)
            if user:
                if payment.is_premium_subscription:
                    now = datetime.utcnow()
                    if user.premium_until and user.premium_until > now:
                        user.premium_until += timedelta(days=30)
                    else:
                        user.premium_until = now + timedelta(days=30)
                        
                    if payment_method_id:
                        user.yookassa_payment_method_id = payment_method_id
                else: 
                    user.has_career_access = True
                    
                amount_val = float(payment_obj.get("amount", {}).get("value", 0))
                if user.invited_id and amount_val > 0:
                    try:
                        inviter_id = int(user.invited_id)
                        inviter = await session.get(User, inviter_id)
                        if inviter:
                            inviter.referral_balance_pending += int(amount_val / 2)
                    except ValueError:
                        pass
                        
            await session.commit()
    
    return {"status": "ok"}

@app.post("/api/subscription/cancel")
async def cancel_subscription(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    from backend.database.models import User
    from fastapi import HTTPException
    user_id = user_data.get("id")
    db_user = await session.get(User, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.yookassa_payment_method_id = None
    await session.commit()
    return {"status": "success"}
