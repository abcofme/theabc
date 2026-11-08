import time
import uuid
from datetime import datetime, timedelta
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.admin_stats import collect_stats, stats_period, test_catalog
from backend.api.common import AI_MODEL, ai_endpoint, get_session, require_admin
from backend.api.security import validate_twa_data
from backend.database.models import (
    User, Test, Question, Answer, Result, TrackingLink, AdminAlert,
)

router = APIRouter()

# Одноразовые токены для скачивания выгрузки тестов: {token: {test_ids, expires_at}}
_export_tokens: dict = {}


class AdminGrantRequest(BaseModel):
    target_username: str
    grant_type: str  # "premium" or "career"

@router.post("/api/admin/grant")
async def admin_grant_access(
    req: AdminGrantRequest,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    await require_admin(user_data, session)
        
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

@router.post("/api/admin/revoke")
async def admin_revoke_access(
    req: AdminRevokeRequest,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    await require_admin(user_data, session)
        
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

@router.get("/api/admin/stats")
async def get_admin_stats(
    start_date: str | None = None,
    end_date: str | None = None,
    unique: bool = False,
    period: Literal["today", "week", "month", "all", "custom"] | None = None,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session),
):
    await require_admin(user_data, session)
    try:
        dates, bounds = stats_period(period, start_date, end_date)
    except OverflowError as exc:
        raise HTTPException(status_code=422, detail="Проверьте даты начала и окончания периода") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    stats = await collect_stats(session, *bounds, unique)
    return {**stats, "start_date": dates[0], "end_date": dates[1]}


@router.get("/api/admin/test_catalog")
async def get_admin_test_catalog(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session),
):
    await require_admin(user_data, session)
    return await test_catalog(session)


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

@router.post("/api/admin/grant_demo")
async def admin_grant_demo(
    request: GrantDemoRequest,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    await require_admin(user_data, session)
        
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

class AITestImportRequest(BaseModel):
    raw_text: str
    category_id: int

@router.post("/api/admin/tests/ai-import")
async def ai_import_test(
    request: Request,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    import httpx, json as _json

    await require_admin(user_data, session)

    # Parse body manually to avoid Pydantic str pattern validation issues
    try:
        body = await request.json()
        raw_text = str(body.get("raw_text", "")).strip()
        category_id = int(body.get("category_id", 0))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка чтения запроса: {str(e)}")

    if not raw_text:
        raise HTTPException(status_code=400, detail="raw_text не может быть пустым")
    if not category_id:
        raise HTTPException(status_code=400, detail="category_id обязателен")

    ai_url, ai_token = ai_endpoint()
    if not ai_url or not ai_token:
        raise HTTPException(status_code=500, detail="AI сервис не настроен")

    prompt = f"""Ты — ассистент по извлечению данных психологических тестов.
Из сырого текста ниже извлеки структуру теста и верни ТОЛЬКО валидный JSON без каких-либо пояснений.

Формат JSON:
{{
  "name": "Название теста",
  "description": "Краткое описание теста (если есть, иначе пустая строка)",
  "questions": [
    {{
      "text": "Текст вопроса",
      "answers": [
        {{"text": "Текст варианта ответа", "value": 1}},
        {{"text": "Текст варианта ответа", "value": 2}}
      ]
    }}
  ],
  "results": [
    {{
      "range_from": 0,
      "range_to": 10,
      "name": "Полный текст интерпретации для данного диапазона баллов"
    }}
  ]
}}

Правила:
- value в answers — это целое число (балл за данный ответ)
- range_from и range_to оба ВКЛЮЧИТЕЛЬНО (например, диапазон 0–9 означает range_from=0, range_to=9)
- Диапазоны не должны перекрываться и должны покрывать все возможные суммы баллов
- Если диапазонов нет — results = []
- Верни ТОЛЬКО JSON, без markdown, без объяснений

Сырой текст теста:
{raw_text}"""

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                ai_url,
                headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                json={"model": AI_MODEL, "messages": [{"role": "user", "content": prompt}]}
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail=f"AI ошибка {resp.status_code}: {resp.text[:300]}")
            ai_content = resp.json()["choices"][0]["message"]["content"].strip()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка соединения с AI: {str(e)}")

    # Parse AI response
    try:
        clean = ai_content.replace("```json", "").replace("```", "").strip()
        data = _json.loads(clean)
    except Exception:
        raise HTTPException(status_code=422, detail=f"AI вернул невалидный JSON: {ai_content[:300]}")

    if "name" not in data or "questions" not in data:
        raise HTTPException(status_code=422, detail="AI не смог извлечь структуру теста")

    # Create test in DB
    test = Test(
        name=data["name"],
        description=data.get("description", "") or "",
        category_id=category_id,
        free=False,
    )
    session.add(test)
    await session.flush()

    for q_data in data.get("questions", []):
        question = Question(test_id=test.id, name=q_data["text"])
        session.add(question)
        await session.flush()
        for a_data in q_data.get("answers", []):
            answer = Answer(
                question_id=question.id,
                name=a_data["text"],
                value=int(a_data.get("value", 0))
            )
            session.add(answer)

    for r_data in data.get("results", []):
        result = Result(
            test_id=test.id,
            range_from=int(r_data.get("range_from", 0)),
            range_to=int(r_data.get("range_to", 0)),
            name=r_data.get("name", "")
        )
        session.add(result)

    await session.commit()
    return {
        "status": "ok",
        "test_id": test.id,
        "test_name": data["name"],
        "questions_count": len(data.get("questions", [])),
        "results_count": len(data.get("results", []))
    }

@router.get("/api/admin/tests/export")
async def export_tests(
    test_ids: str = "",
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    await require_admin(user_data, session)

    # Clean expired tokens
    now = time.time()
    expired = [k for k, v in _export_tokens.items() if v["expires_at"] < now]
    for k in expired:
        del _export_tokens[k]

    token = str(uuid.uuid4())
    _export_tokens[token] = {
        "test_ids": test_ids,
        "expires_at": now + 120  # valid 2 minutes
    }
    return {"token": token}

@router.get("/api/admin/tests/export/download")
async def download_export_by_token(
    token: str,
    session: AsyncSession = Depends(get_session)
):
    from fastapi.responses import PlainTextResponse
    import datetime as dt

    entry = _export_tokens.pop(token, None)
    if not entry or entry["expires_at"] < time.time():
        raise HTTPException(status_code=403, detail="Токен недействителен или истёк")

    test_ids = entry["test_ids"]
    if test_ids:
        ids = [int(i) for i in test_ids.split(",") if i.strip().isdigit()]
        query = select(Test).options(
            selectinload(Test.questions).selectinload(Question.answers),
            selectinload(Test.results)
        ).where(Test.id.in_(ids))
    else:
        query = select(Test).options(
            selectinload(Test.questions).selectinload(Question.answers),
            selectinload(Test.results)
        )

    tests = (await session.execute(query)).scalars().all()

    lines = []
    for test in tests:
        lines.append(f"{'='*60}")
        lines.append(f"ТЕСТ: {test.name}")
        if test.description:
            lines.append(f"Описание: {test.description}")
        lines.append("")
        if test.results:
            lines.append("--- ИНТЕРПРЕТАЦИИ (баллы → результат) ---")
            for r in sorted(test.results, key=lambda x: x.range_from):
                lines.append(f"  [{r.range_from} – {r.range_to}] {r.name}")
            lines.append("")
        if test.questions:
            lines.append("--- ВОПРОСЫ И ВАРИАНТЫ ОТВЕТОВ ---")
            for i, q in enumerate(test.questions, 1):
                lines.append(f"  {i}. {q.name}")
                for a in sorted(q.answers, key=lambda x: x.value):
                    lines.append(f"       [{a.value}] {a.name}")
            lines.append("")

    content = "\n".join(lines)
    filename = f"tests_export_{dt.date.today()}.txt"
    return PlainTextResponse(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.get("/api/admin/tests/{test_id}")
async def get_admin_test_details(
    test_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    await require_admin(user_data, session)
        
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

@router.post("/api/admin/tests")
async def create_admin_test(
    payload: TestCreate,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    await require_admin(user_data, session)
        
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

@router.put("/api/admin/tests/{test_id}")
async def update_admin_test(
    test_id: int,
    payload: TestCreate,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    await require_admin(user_data, session)
        
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


@router.delete("/api/admin/tests/{test_id}")
async def delete_admin_test(
    test_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    await require_admin(user_data, session)
    
    test = await session.get(Test, test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    from sqlalchemy import delete as sa_delete
    from backend.database.models import Progress, Result, ProgressLog

    # Delete in correct FK order
    await session.execute(sa_delete(ProgressLog).where(ProgressLog.test_id == test_id))
    await session.execute(sa_delete(Progress).where(Progress.test_id == test_id))
    await session.execute(sa_delete(Result).where(Result.test_id == test_id))

    # Delete answers for all questions of this test
    from backend.database.models import Answer as Ans, Question as Q
    subq = select(Q.id).where(Q.test_id == test_id)
    await session.execute(sa_delete(Ans).where(Ans.question_id.in_(subq)))
    await session.execute(sa_delete(Q).where(Q.test_id == test_id))

    await session.delete(test)
    await session.commit()
    return {"status": "success"}


@router.get("/api/admin/tracking_links")
async def get_tracking_links(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    await require_admin(user_data, session)
    
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

@router.post("/api/admin/tracking_links")
async def create_tracking_link(
    data: dict,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    import random
    import string
    await require_admin(user_data, session)
        
    name = data.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
        
    code = ''.join(random.choices(string.ascii_letters + string.digits, k=10))
    
    new_link = TrackingLink(name=name, code=code)
    session.add(new_link)
    await session.commit()
    await session.refresh(new_link)
    
    return {"id": new_link.id, "name": new_link.name, "code": new_link.code, "clicks_count": 0}

@router.delete("/api/admin/tracking_links/{link_id}")
async def delete_tracking_link(
    link_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    await require_admin(user_data, session)
        
    link = await session.get(TrackingLink, link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
        
    await session.delete(link)
    await session.commit()
    return {"status": "success"}


# Мониторинг: отчет о производительности и алерты (backend/performance.py, backend/alerts.py)
@router.get("/api/admin/performance")
async def get_performance(
    hours: int = 24,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    from backend.performance import report

    await require_admin(user_data, session)
    return await report(session, 168 if hours > 24 else 24)


@router.get("/api/admin/alerts")
async def get_alerts(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    await require_admin(user_data, session)
    alerts = (await session.execute(select(AdminAlert).order_by(AdminAlert.last_at.desc()).limit(50))).scalars().all()
    unseen = await session.scalar(select(func.count()).select_from(AdminAlert).where(AdminAlert.seen.is_(False)))
    return {
        "unseen": unseen,
        "alerts": [{
            "id": a.id, "kind": a.kind, "title": a.title, "text": a.text, "count": a.count, "seen": a.seen,
            "created_at": a.created_at.isoformat() + "Z", "last_at": a.last_at.isoformat() + "Z",
        } for a in alerts],
    }


@router.post("/api/admin/alerts/seen")
async def mark_alerts_seen(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    from sqlalchemy import update

    await require_admin(user_data, session)
    await session.execute(update(AdminAlert).where(AdminAlert.seen.is_(False)).values(seen=True))
    await session.commit()
    return {"status": "success"}
