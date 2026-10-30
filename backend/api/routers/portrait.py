from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from backend.api.common import AI_MODEL, GENDER_NEUTRAL_RULE, ai_endpoint, get_session
from backend.api.security import validate_twa_data
from backend.billing import charge, refund
from backend.database.models import Category, Test, Progress, Result, PersonalityPortrait

router = APIRouter()


# Удаление портрета: дневник перестаёт отвечать, пока портрет не сформируют заново
@router.delete("/api/portrait/clear")
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

# Генерация портрета личности

async def _generate_portrait_bg(user_id: int, user_tests_count: int, prompt: str, ai_url: str, ai_token: str, charged: int):
    result = await _generate_portrait(user_id, user_tests_count, prompt, ai_url, ai_token)
    if result["status"] != "success":
        await refund(user_id, charged)
        return
    from backend.telegram.notify import notify
    await notify(user_id, "✨ <b>Портрет личности готов</b>\n\n"
                          "Теперь дневник будет сверять с ним <b>твои реакции</b>.\n\n"
                          "<i>Загляни — там твои сильные стороны и особенности</i> 👇",
                 "tab=profile&page=portrait", "✨ Открыть портрет")


async def _generate_portrait(user_id: int, user_tests_count: int, prompt: str, ai_url: str, ai_token: str) -> dict:
    import httpx
    from backend.database import async_session
    from backend.database.models import PortraitLog

    # Добавляем инструкции для JSON формата и технического саммари
    prompt += '\n\nВАЖНО: В поле description напиши до 3 предложений пояснения, почему ты выбрал именно такое % соответствия на этой шкале.'
    prompt += '\n\n' + GENDER_NEUTRAL_RULE
    prompt += '\n\nВыведи только красивый Markdown текст (включая блок с ```json внутри для шкал). Без дополнительных вступлений.'
    prompt += '\n\nОФОРМЛЕНИЕ: основные разделы начинай с ##, подзаголовки внутри — с ###. Одна мысль в абзаце, 2–4 предложения; между абзацами, заголовками и списками пустая строка. Названия поведенческих паттернов выделяй жирным в начале отдельного абзаца в формате **Реакция на стресс:** текст. Ключевые выводы выделяй коротким **жирным** фрагментом. Независимые черты и проявления оформляй маркированными списками, последовательность — нумерованными. Для содержательного сравнения допустима короткая таблица из двух колонок. Не выделяй жирным целые абзацы, не добавляй текст или дополнительные разделы ради оформления. Не меняй заданную структуру JSON шкал, не выноси их данные в таблицу.'

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            ai_response = await client.post(
                ai_url,
                headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                json={
                    "model": AI_MODEL,
                    "messages": [{"role": "user", "content": prompt}]
                }
            )
            
            if ai_response.status_code == 404:
                ai_response = await client.post(
                    ai_url,
                    headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                    json={
                        "model": AI_MODEL,
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

            async with async_session() as db:
                existing = (await db.execute(select(PersonalityPortrait).where(PersonalityPortrait.user_id == user_id))).scalars().first()
                if existing:
                    existing.content = content
                    existing.tests_count = user_tests_count
                    new_portrait = existing
                else:
                    new_portrait = PersonalityPortrait(user_id=user_id, content=content, tests_count=user_tests_count)
                    db.add(new_portrait)
                
                # Записываем генерацию в лог для не-уникальной статистики
                db.add(PortraitLog(user_id=user_id))
                
                await db.commit()
                await db.refresh(new_portrait)
                
            return {"status": "success", "portrait": new_portrait}
    except Exception as e:
        import traceback
        traceback.print_exc()
        print("BG portrait failed:", repr(e))
        return {"status": "error", "message": repr(e)}

@router.post("/api/portrait/generate")
async def generate_personality_portrait(
    background_tasks: BackgroundTasks,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")

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

    # 3. Запрос к агенту Timeweb Cloud AI
    ai_url, ai_token = ai_endpoint()
    if not ai_url or not ai_token:
        raise HTTPException(status_code=500, detail="AI сервис не настроен")
        
    charged = await charge(session, user_id, "portrait")

    # Запускаем генерацию в фоне и сразу возвращаем ответ
    background_tasks.add_task(_generate_portrait_bg, user_id, total_tests, prompt, ai_url, ai_token, charged)
    return {"status": "generating"}
