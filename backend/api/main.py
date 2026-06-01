from datetime import datetime
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from backend.api.security import validate_twa_data
from backend.database import async_session
from backend.database.models import User, Category, Test, Progress, DiaryEntry, Result
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
    for cat in categories:
        cat_data = {"id": cat.id, "name": cat.name, "tests": []}
        for t in cat.tests:
            passed = t.id in user_results
            cat_data["tests"].append({
                "id": t.id,
                "name": t.name,
                "passed": passed,
                "result_text": user_results.get(t.id, None)
            })
        result_data.append(cat_data)
        
    return {"categories": result_data}

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
        {"id": e.id, "date": e.date.isoformat(), "event": e.event, "reaction": e.reaction, "rating": getattr(e, "rating", None)}
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