import asyncio
import html
from datetime import date as DateType, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from backend.api.common import AI_MODEL, ai_endpoint, get_session, run_in_background
from backend.api.security import validate_twa_data
from backend.billing import charge, refund
from backend.database.models import Category, Test, Progress, Result, DiaryEntry, PersonalityPortrait, BehavioralReport

router = APIRouter()

# Короткие названия отчётов для сообщений бота
REPORT_TITLES_SHORT = {
    "Какие события чаще всего повторяются в моей жизни?": "Повторяющиеся события",
    "На какие ситуации я реагирую эффективно, а на какие нет?": "Мои реакции",
}


class ReportGenerateRequest(BaseModel):
    period: str
    start_date: Optional[DateType] = None
    end_date: Optional[DateType] = None
    report_type: str

@router.get("/api/reports")
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

def _period_bounds(period: str, start_date, end_date):
    """Начало и конец периода отчёта; начало None — за всё время"""
    today = datetime.now().date()
    days = {"week": 7, "month": 30, "3months": 90, "year": 365}
    if period in days:
        return today - timedelta(days=days[period]), today
    if period == "custom":
        return start_date, end_date or today
    return None, today


def _period_entries(query, user_id: int, start_d, end_d):
    query = query.where(DiaryEntry.user_id == user_id)
    if start_d:
        query = query.where(DiaryEntry.date >= start_d)
    if end_d:
        query = query.where(DiaryEntry.date <= end_d)
    return query


# Сколько записей дневника попадёт в отчёт: от этого зависит его точность
@router.get("/api/reports/entries-count")
async def count_report_entries(
    period: str = "all",
    start_date: Optional[DateType] = None,
    end_date: Optional[DateType] = None,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    start_d, end_d = _period_bounds(period, start_date, end_date)
    query = _period_entries(select(func.count(DiaryEntry.id)), user_data.get("id"), start_d, end_d)
    return {"count": (await session.execute(query)).scalar() or 0}


@router.post("/api/reports/{report_id}/read")
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


# Сколько ждать, пока пользователь сам откроет готовый отчёт в приложении, прежде чем написать в боте
REPORT_READY_NOTIFY_DELAY = 20


async def _notify_if_unread(user_id: int, report_id: int, title: str):
    """Пользователь ушёл из приложения, пока отчёт строился, — сообщаем в боте, что он готов"""
    from backend.database import async_session
    from backend.telegram.notify import notify
    await asyncio.sleep(REPORT_READY_NOTIFY_DELAY)
    async with async_session() as db:
        report = await db.get(BehavioralReport, report_id)
        if not report or report.is_read:
            return
    await notify(user_id, f"📊 <b>Отчет «{html.escape(title)}» готов</b>\n\n"
                          "<i>Он собран по твоим записям в дневнике</i> 👇",
                 f"tab=reports&report={report_id}", "📊 Открыть отчет")


async def _generate_report_bg(user_id: int, report_title: str, report_prompt: str, start_d, end_d, ai_url: str, ai_token: str, num_entries: int, charged: int):
    result = await _generate_report(user_id, report_title, report_prompt, start_d, end_d, ai_url, ai_token, num_entries)
    if result.get("status") == "success":
        run_in_background(_notify_if_unread(user_id, result["report"].id, REPORT_TITLES_SHORT.get(report_title, report_title)))
    else:
        await refund(user_id, charged)
    return result


async def _generate_report(user_id: int, report_title: str, report_prompt: str, start_d, end_d, ai_url: str, ai_token: str, num_entries: int) -> dict:
    import httpx
    from backend.database import async_session
    try:
        payload = {
            "model": AI_MODEL,
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
                payload["model"] = AI_MODEL
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
        return {"detail": "Не удалось сформировать отчет. Попробуйте позже — деньги с баланса не списаны."}

@router.delete("/api/reports/{report_id}")
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

@router.post("/api/reports/generate")
async def generate_report(
    req: ReportGenerateRequest,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")

    # 1. Получаем контекст (портрет или тесты) в зависимости от типа отчета
    portrait = None
    test_results_text = ""
    
    if req.report_type in ['repeating_events', 'effective_reactions']:
        portrait_query = select(PersonalityPortrait).where(PersonalityPortrait.user_id == user_id)
        portrait = (await session.execute(portrait_query)).scalars().first()
        
        if not portrait:
            raise HTTPException(status_code=400, detail="Для формирования отчета сначала необходимо сформировать портрет личности.")
    elif req.report_type in ['energy', 'competence']:
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

        if not test_results_text:
            raise HTTPException(status_code=400, detail="Сначала пройдите тесты профориентации: отчет строится по их результатам.")

    # 2. Определяем даты
    start_d, end_d = _period_bounds(req.period, req.start_date, req.end_date)

    # 3. Достаем записи дневника
    diary_query = _period_entries(select(DiaryEntry), user_id, start_d, end_d).order_by(DiaryEntry.date.asc())
    entries = (await session.execute(diary_query)).scalars().all()

    if not entries:
        raise HTTPException(status_code=400, detail="Недостаточно записей в дневнике за этот период для формирования отчета.")

    # Формируем текст записей для промпта
    entries_text = ""
    for e in entries:
        addition = f"\nДополнение: {e.addition}" if e.addition else ""
        entries_text += f"- Дата: {e.date}\nСобытие: {e.event}\nРеакция: {e.reaction}{addition}\nОценка дня: {e.rating if e.rating else 'Не указана'}\n\n"

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

Создай глубокий, живой, динамичный и точный отчет, обращаясь к пользователю на "ты" — тепло и уважительно, как во всем приложении.
ВАЖНОЕ ТРЕБОВАНИЕ: Этот отчет обязан отвечать на вопрос "{report_title}", а не просто давать произвольный анализ. В отчете должно быть МИНИМУМ рекомендаций, ТОЛЬКО глубокий анализ.

Структура отчета (используй Markdown-разметку, как в портрете личности, с заголовками h2, жирным текстом и маркированными списками):
1. **Главный паттерн**: Самое яркое повторяющееся событие или реакция.
2. **Как это связано с твоим портретом**: Почему ты реагируешь именно так (со ссылкой на черты личности из портрета).
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

Создай глубокий, живой, динамичный и точный отчет, обращаясь к пользователю на "ты" — тепло и уважительно, как во всем приложении.
ВАЖНОЕ ТРЕБОВАНИЕ: Этот отчет обязан отвечать на вопрос "{report_title}", а не просто давать произвольный анализ. В отчете должно быть МИНИМУМ рекомендаций, ТОЛЬКО глубокий анализ.

Структура отчета (используй Markdown-разметку, как в портрете личности, с заголовками h2, жирным текстом и маркированными списками):
1. **Зоны эффективности**: В каких ситуациях (дни, события) твоя реакция была максимально конструктивной.
2. **Зоны роста**: Где твои автоматические реакции мешают тебе, исходя из твоего портрета личности.
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

Создай глубокий, живой, динамичный и точный отчет, обращаясь к пользователю на "ты" — тепло и уважительно, как во всем приложении.
ВАЖНОЕ ТРЕБОВАНИЕ: Этот отчет обязан отвечать на вопросы, связанные с генерацией и потерей энергии, а не просто давать произвольный анализ. В отчете должно быть МИНИМУМ рекомендаций, ТОЛЬКО глубокий анализ.

Структура отчета (используй Markdown-разметку, как в портрете личности, с заголовками h2, жирным текстом и маркированными списками):
1. **Источники энергии**: Действия, задачи или ситуации, от которых ты забываешь про время и получаешь приток сил.
2. **Пожиратели энергии**: Что именно забирает твои силы и почему (с опорой на твои результаты тестов).
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

Создай глубокий, живой, динамичный и точный отчет, обращаясь к пользователю на "ты" — тепло и уважительно, как во всем приложении.
ВАЖНОЕ ТРЕБОВАНИЕ: Этот отчет обязан подсветить компетентность пользователя и его реальные победы, а не просто давать произвольный анализ. В отчете должно быть МИНИМУМ рекомендаций, ТОЛЬКО глубокий анализ.

Структура отчета (используй Markdown-разметку, как в портрете личности, с заголовками h2, жирным текстом и маркированными списками):
1. **Твои победы и достижения**: В каких ситуациях ты проявил(а) себя максимально компетентно (даже в мелочах).
2. **Твоя настоящая сила**: В чем заключается твоя уникальная компетентность, с опорой на твои результаты тестов.
3. **Краткий вывод**: Один-два предложения анализа (без списков рекомендаций).

СТРОГОЕ ПРАВИЛО ФОРМАТИРОВАНИЯ:
Формируй ответ СТРОГО в виде аналитического отчета. КАТЕГОРИЧЕСКИ ЗАПРЕЩАЕТСЯ использовать диалоговые клише, приветствия и прощания, такие как 'Заключение', 'Могу вам предложить', 'Вот ваш отчет', 'Здравствуйте', 'Если у вас есть вопросы' и любые обращения к пользователю вне контекста анализа. Текст должен быть самодостаточным, объективным и структурированным, начинаться сразу с заголовка отчета и заканчиваться последним пунктом плана, без попыток завязать диалог.
Пиши интересно, без воды, показывай динамику."""
    else:
        raise HTTPException(status_code=400, detail="Неизвестный тип отчета.")

    report_prompt += "\n\nОФОРМЛЕНИЕ: каждый раздел начинай с заголовка ## на отдельной строке, отдельные паттерны внутри раздела — с ###. Между заголовками, абзацами и списками оставляй пустую строку. Один абзац — одна мысль, 2–4 предложения. Первое ключевое наблюдение раздела выделяй коротким **жирным** фрагментом. Для подписанных пояснений используй отдельные абзацы **Наблюдение:** текст, **Связь с портретом:** текст или **Вывод:** текст, если подпись помогает понять содержание. Независимые наблюдения оформляй маркированным списком, последовательность действий — нумерованным. Короткие дословные цитаты из дневника можно выделять блоком >; не придумывай цитаты. Для содержательного сравнения двух сценариев допустима короткая таблица из двух колонок; не помещай длинные абзацы в ячейки. Не добавляй рекомендации или новые разделы вопреки заданной выше структуре. Не повторяй вступление, не выделяй целиком абзацы, не добавляй текст ради форматирования."

    ai_url, ai_token = ai_endpoint()
    if not ai_url or not ai_token:
        raise HTTPException(status_code=500, detail="AI сервис не настроен")

    charged = await charge(session, user_id, "report")
    task = run_in_background(_generate_report_bg(user_id, report_title, report_prompt, start_d, end_d, ai_url, ai_token, len(entries), charged))
    
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
