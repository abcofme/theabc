import asyncio
import html
from datetime import date as DateType, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.analysis_results import format_test_results, load_analysis_test_results
from backend.api.common import AI_MODEL, GENDER_NEUTRAL_RULE, ai_endpoint, get_session, run_in_background
from backend.api.security import validate_twa_data
from backend.billing import charge, refund
from backend.bonuses import award
from backend.database.models import BehavioralReport, ContentLog, DiaryEntry
from backend.token_usage import complete_charge

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
# Timeweb учитывает рассуждения модели в лимите ответа. Стандартных 4096 токенов
# может не хватить для текста отчёта, особенно за длинный период.
REPORT_MAX_TOKENS = 16000
REPORT_AI_TIMEOUT = 180.0
REPORT_GENERATION_ERROR = "Не удалось сформировать отчет. Попробуйте позже — листики с баланса не списаны."


async def _notify_if_unread(user_id: int, report_id: int, title: str):
    """Пользователь ушёл из приложения, пока отчёт строился, — сообщаем в боте, что он готов"""
    from backend.database import async_session
    from backend.telegram.notify import notify
    await asyncio.sleep(REPORT_READY_NOTIFY_DELAY)
    async with async_session() as db:
        report = await db.get(BehavioralReport, report_id)
        if not report or report.is_read:
            return
    await notify(user_id, f"<b>Отчёт «{html.escape(title)}» готов</b>\n\n"
                          "Он собран по твоим записям и результатам тестов.",
                 f"tab=reports&report={report_id}", "Открыть отчёт")


async def _generate_report_bg(user_id: int, report_type: str, report_title: str, report_prompt: str, start_d, end_d, ai_url: str, ai_token: str, num_entries: int, charged: int | None):
    result = await _generate_report(user_id, report_type, report_title, report_prompt, start_d, end_d, ai_url, ai_token, num_entries, charged)
    if result.get("status") == "success":
        await award(user_id, f"report_{report_type}")
        run_in_background(_notify_if_unread(user_id, result["report"].id, REPORT_TITLES_SHORT.get(report_title, report_title)))
    else:
        await refund(user_id, charged)
    return result


async def _generate_report(user_id: int, report_type: str, report_title: str, report_prompt: str, start_d, end_d, ai_url: str, ai_token: str, num_entries: int, charged: int | None = None) -> dict:
    import httpx
    from backend.database import async_session
    try:
        payload = {
            "model": AI_MODEL,
            "max_tokens": REPORT_MAX_TOKENS,
            "messages": [{"role": "user", "content": report_prompt + "\n\n" + GENDER_NEUTRAL_RULE}]
        }
        async with httpx.AsyncClient(timeout=REPORT_AI_TIMEOUT) as client:
            ai_response = await client.post(
                ai_url,
                headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                json=payload
            )

            if ai_response.status_code == 404:
                ai_response = await client.post(
                    ai_url,
                    headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                    json=payload
                )

            ai_response.raise_for_status()

        choice = (ai_response.json().get("choices") or [{}])[0]
        generated_text = ((choice.get("message") or {}).get("content") or "").strip()
        finish_reason = choice.get("finish_reason")
        if not generated_text or finish_reason in {"length", "content_filter", "error"}:
            logger.warning(
                "AI report incomplete: type={}, entries={}, chars={}, finish_reason={}",
                report_type, num_entries, len(generated_text), finish_reason,
            )
            return {"detail": REPORT_GENERATION_ERROR}

        async with async_session() as db:
            created_at = datetime.utcnow()
            new_report = BehavioralReport(
                user_id=user_id,
                created_at=created_at,
                title=report_title,
                period_start=start_d,
                period_end=end_d,
                content=generated_text
            )
            db.add_all([new_report, ContentLog(user_id=user_id, kind=report_type, created_at=created_at)])
            await complete_charge(db, charged, feature=report_type)
            await db.commit()
        return {"status": "success", "report": new_report}
    except httpx.HTTPStatusError as error:
        logger.error(
            "AI report HTTP error: type={}, entries={}, status={}",
            report_type, num_entries, error.response.status_code,
        )
        return {"detail": REPORT_GENERATION_ERROR}
    except Exception as error:
        logger.error(
            "AI report failed: type={}, entries={}, error={}",
            report_type, num_entries, type(error).__name__,
        )
        return {"detail": REPORT_GENERATION_ERROR}

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

    if req.report_type not in ('repeating_events', 'effective_reactions', 'energy', 'competence'):
        raise HTTPException(status_code=400, detail="Неизвестный тип отчета.")

    test_results = await load_analysis_test_results(session, user_id)
    if not test_results:
        raise HTTPException(status_code=400, detail="Чтобы сформировать отчёт, пройдите хотя бы по одному тесту в каждой категории.")

    start_d, end_d = _period_bounds(req.period, req.start_date, req.end_date)

    # Достаем записи дневника за выбранный период
    diary_query = _period_entries(select(DiaryEntry), user_id, start_d, end_d).order_by(DiaryEntry.date.asc())
    entries = (await session.execute(diary_query)).scalars().all()

    if not entries:
        raise HTTPException(status_code=400, detail="Недостаточно записей в дневнике за этот период для формирования отчета.")

    # Формируем текст записей для промпта
    entries_text = ""
    for e in entries:
        addition = f"\nДополнение: {e.addition}" if e.addition else ""
        entries_text += f"- Дата: {e.date}\nСобытие: {e.event}\nРеакция: {e.reaction}{addition}\nОценка дня: {e.rating if e.rating else 'Не указана'}\n\n"

    analysis_context = f"""Результаты всех пройденных тестов:
{format_test_results(test_results)}

Записи дневника:
{entries_text}

Просмотри все результаты и используй те, что связаны с темой отчёта. Наблюдения подтверждай записями, а связи с тестами формулируй как предположения. Если есть только балл без интерпретации, не додумывай его значение. Не делай выводы по тестам, результатов которых нет."""

    # Формируем промпт в зависимости от типа отчета
    report_title = ""
    report_prompt = ""
    
    if req.report_type == 'repeating_events':
        report_title = "Какие события чаще всего повторяются в моей жизни?"
        report_prompt = f"""Ты выступаешь в роли профессионального психолога-аналитика.
Твоя задача: найти повторяющиеся паттерны событий в дневнике пользователя и сопоставить их с результатами тестов.

{analysis_context}

Создай глубокий, живой, динамичный и точный отчет, обращаясь к пользователю на "ты" — тепло и уважительно, как во всем приложении.
ВАЖНОЕ ТРЕБОВАНИЕ: Этот отчет обязан отвечать на вопрос "{report_title}", а не просто давать произвольный анализ. В отчете должно быть МИНИМУМ рекомендаций, ТОЛЬКО глубокий анализ.

Структура отчета (используй Markdown с заголовками h2, жирным текстом и маркированными списками):
1. **Главный паттерн**: Самое яркое повторяющееся событие или реакция.
2. **Как это связано с результатами тестов**: Какие результаты помогают понять повторяющиеся реакции. Назови конкретные тесты и опиши связь как предположение.
3. **Краткий вывод**: Один-два предложения анализа (без списков рекомендаций).

СТРОГОЕ ПРАВИЛО ФОРМАТИРОВАНИЯ:
Формируй ответ СТРОГО в виде аналитического отчета. КАТЕГОРИЧЕСКИ ЗАПРЕЩАЕТСЯ использовать диалоговые клише, приветствия и прощания, такие как 'Заключение', 'Могу вам предложить', 'Вот ваш отчет', 'Здравствуйте', 'Если у вас есть вопросы' и любые обращения к пользователю вне контекста анализа. Текст должен быть самодостаточным, объективным и структурированным, начинаться сразу с заголовка отчета и заканчиваться последним пунктом плана, без попыток завязать диалог.
Пиши интересно, без воды, показывай динамику."""
    elif req.report_type == 'effective_reactions':
        report_title = "На какие ситуации я реагирую эффективно, а на какие нет?"
        report_prompt = f"""Ты выступаешь в роли профессионального психолога-аналитика.
Твоя задача: оценить эффективность реакций пользователя по записям дневника и сопоставить наблюдения с результатами тестов.

{analysis_context}

Создай глубокий, живой, динамичный и точный отчет, обращаясь к пользователю на "ты" — тепло и уважительно, как во всем приложении.
ВАЖНОЕ ТРЕБОВАНИЕ: Этот отчет обязан отвечать на вопрос "{report_title}", а не просто давать произвольный анализ. В отчете должно быть МИНИМУМ рекомендаций, ТОЛЬКО глубокий анализ.

Структура отчета (используй Markdown с заголовками h2, жирным текстом и маркированными списками):
1. **Зоны эффективности**: В каких ситуациях (дни, события) твоя реакция была максимально конструктивной.
2. **Зоны роста**: Где, судя по записям, автоматические реакции мешают тебе и какие результаты тестов помогают их понять.
3. **Краткий вывод**: Один-два предложения анализа (без списков рекомендаций).

СТРОГОЕ ПРАВИЛО ФОРМАТИРОВАНИЯ:
Формируй ответ СТРОГО в виде аналитического отчета. КАТЕГОРИЧЕСКИ ЗАПРЕЩАЕТСЯ использовать диалоговые клише, приветствия и прощания, такие как 'Заключение', 'Могу вам предложить', 'Вот ваш отчет', 'Здравствуйте', 'Если у вас есть вопросы' и любые обращения к пользователю вне контекста анализа. Текст должен быть самодостаточным, объективным и структурированным, начинаться сразу с заголовка отчета и заканчиваться последним пунктом плана, без попыток завязать диалог.
Пиши интересно, без воды, показывай динамику."""
    elif req.report_type == 'energy':
        report_title = "Энергия"
        report_prompt = f"""Ты выступаешь в роли профессионального психолога-аналитика.
Твоя задача: проанализировать записи дневника и результаты всех пройденных тестов пользователя, включая профориентацию, чтобы понять, какие действия и задачи дают ему энергию, а какие забирают. От каких задач он забывает про время?

{analysis_context}

Создай глубокий, живой, динамичный и точный отчет, обращаясь к пользователю на "ты" — тепло и уважительно, как во всем приложении.
ВАЖНОЕ ТРЕБОВАНИЕ: Этот отчет обязан отвечать на вопросы, связанные с генерацией и потерей энергии, а не просто давать произвольный анализ. В отчете должно быть МИНИМУМ рекомендаций, ТОЛЬКО глубокий анализ.

Структура отчета (используй Markdown с заголовками h2, жирным текстом и маркированными списками):
1. **Источники энергии**: Действия, задачи или ситуации, от которых ты забываешь про время и получаешь приток сил.
2. **Пожиратели энергии**: Что именно забирает твои силы и почему (с опорой на твои результаты тестов).
3. **Краткий вывод**: Один-два предложения анализа (без списков рекомендаций).

СТРОГОЕ ПРАВИЛО ФОРМАТИРОВАНИЯ:
Формируй ответ СТРОГО в виде аналитического отчета. КАТЕГОРИЧЕСКИ ЗАПРЕЩАЕТСЯ использовать диалоговые клише, приветствия и прощания, такие как 'Заключение', 'Могу вам предложить', 'Вот ваш отчет', 'Здравствуйте', 'Если у вас есть вопросы' и любые обращения к пользователю вне контекста анализа. Текст должен быть самодостаточным, объективным и структурированным, начинаться сразу с заголовка отчета и заканчиваться последним пунктом плана, без попыток завязать диалог.
Пиши интересно, без воды, показывай динамику."""
    else:
        report_title = "Чувство компетентности"
        report_prompt = f"""Ты выступаешь в роли профессионального психолога-аналитика.
Твоя задача: на основе дневника и результатов всех пройденных тестов, включая профориентацию, показать пользователю его сильные стороны, маленькие и большие победы, а также ситуации, в которых он проявляет компетентность.

{analysis_context}

Создай глубокий, живой, динамичный и точный отчет, обращаясь к пользователю на "ты" — тепло и уважительно, как во всем приложении.
ВАЖНОЕ ТРЕБОВАНИЕ: Этот отчет обязан подсветить компетентность пользователя и его реальные победы, а не просто давать произвольный анализ. В отчете должно быть МИНИМУМ рекомендаций, ТОЛЬКО глубокий анализ.

Структура отчета (используй Markdown с заголовками h2, жирным текстом и маркированными списками):
1. **Твои победы и достижения**: В каких ситуациях твоя компетентность проявляется ярче всего (даже в мелочах).
2. **Твоя настоящая сила**: В чем заключается твоя уникальная компетентность, с опорой на твои результаты тестов.
3. **Краткий вывод**: Один-два предложения анализа (без списков рекомендаций).

СТРОГОЕ ПРАВИЛО ФОРМАТИРОВАНИЯ:
Формируй ответ СТРОГО в виде аналитического отчета. КАТЕГОРИЧЕСКИ ЗАПРЕЩАЕТСЯ использовать диалоговые клише, приветствия и прощания, такие как 'Заключение', 'Могу вам предложить', 'Вот ваш отчет', 'Здравствуйте', 'Если у вас есть вопросы' и любые обращения к пользователю вне контекста анализа. Текст должен быть самодостаточным, объективным и структурированным, начинаться сразу с заголовка отчета и заканчиваться последним пунктом плана, без попыток завязать диалог.
Пиши интересно, без воды, показывай динамику."""
    report_prompt += "\n\nОФОРМЛЕНИЕ: каждый раздел начинай с заголовка ## на отдельной строке, отдельные паттерны внутри раздела — с ###. Между заголовками, абзацами и списками оставляй пустую строку. Один абзац — одна мысль, 2–4 предложения. Первое ключевое наблюдение раздела выделяй коротким **жирным** фрагментом. Для подписанных пояснений используй отдельные абзацы **Наблюдение:** текст, **Связь с результатами тестов:** текст или **Вывод:** текст, если подпись помогает понять содержание. Независимые наблюдения оформляй маркированным списком, последовательность действий — нумерованным. Короткие дословные цитаты из дневника можно выделять блоком >; не придумывай цитаты. Для содержательного сравнения двух сценариев допустима короткая таблица из двух колонок; не помещай длинные абзацы в ячейки. Не добавляй рекомендации или новые разделы вопреки заданной выше структуре. Не повторяй вступление, не выделяй целиком абзацы, не добавляй текст ради форматирования."

    ai_url, ai_token = ai_endpoint()
    if not ai_url or not ai_token:
        raise HTTPException(status_code=500, detail="AI сервис не настроен")

    charged = await charge(session, user_id, "report")
    task = run_in_background(_generate_report_bg(user_id, req.report_type, report_title, report_prompt, start_d, end_d, ai_url, ai_token, len(entries), charged))
    
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
