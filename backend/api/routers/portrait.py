import asyncio
import json
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.analysis_results import load_analysis_test_results
from backend.api.ai_jobs import check_prompt_size, start_ai_job
from backend.api.common import AI_MODEL, GENDER_NEUTRAL_RULE, ai_endpoint, get_session
from backend.api.security import validate_twa_data
from backend.billing import refund
from backend.bonuses import award
from backend.database import async_session
from backend.database.models import Category, PersonalityPortrait, PortraitLog, Test
from backend.portrait_content import PORTRAIT_CATEGORIES, REQUIRED_PORTRAIT_CATEGORIES, build_portrait
from backend.token_usage import complete_charge

router = APIRouter()
PORTRAIT_PROMPT = (Path(__file__).resolve().parents[2] / "prompts" / "personality_portrait.txt").read_text(
    encoding="utf-8"
).strip() + "\n\n" + GENDER_NEUTRAL_RULE


async def _find_portrait(session, user_id):
    return await session.scalar(select(PersonalityPortrait).where(PersonalityPortrait.user_id == user_id))


@router.delete("/api/portrait/clear")
async def clear_personality_portrait(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session),
):
    portrait = await _find_portrait(session, user_data["id"])
    if portrait:
        await session.delete(portrait)
        await session.commit()
        return {"status": "success", "message": "Портрет удален"}
    return {"status": "not_found", "message": "Портрет не найден"}


async def _generate_portrait(user_id, tests_count, test_groups, evidence, ai_url, ai_token, charged):
    try:
        async with asyncio.timeout(90), httpx.AsyncClient(timeout=90.0) as client:
            request = {
                "headers": {"Authorization": f"Bearer {ai_token}"},
                "json": {
                    "model": AI_MODEL,
                    "messages": [
                        {"role": "system", "content": PORTRAIT_PROMPT},
                        {"role": "user", "content": evidence},
                    ],
                },
            }
            response = await client.post(ai_url, **request)
            if response.status_code == 404:
                response = await client.post(ai_url, **request)
            response.raise_for_status()
            answer = response.json()["choices"][0]["message"]["content"]
            content, metadata = build_portrait(answer, test_groups)

        async with async_session() as db:
            portrait = await _find_portrait(db, user_id)
            if portrait is None:
                portrait = PersonalityPortrait(user_id=user_id)
                db.add(portrait)
            else:
                portrait.updated_at = func.now()
            portrait.content = content
            portrait.technical_summary = metadata
            portrait.tests_count = tests_count
            db.add(PortraitLog(user_id=user_id))
            await complete_charge(db, charged)
            await db.commit()
    except Exception as error:
        logger.warning("Portrait generation failed: {}", type(error).__name__)
        await refund(user_id, charged)
        return

    await award(user_id, "portrait")
    from backend.telegram.notify import notify

    await notify(
        user_id, "<b>Портрет личности готов</b>\n\nВ нём собраны твои результаты по пяти категориям.",
        "tab=profile&page=portrait", "Открыть портрет",
    )


@router.post("/api/portrait/generate")
async def generate_personality_portrait(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session),
):
    user_id = user_data["id"]
    required_count = await session.scalar(
        select(func.count(Test.id)).join(Category).where(Category.name.in_(REQUIRED_PORTRAIT_CATEGORIES))
    )
    results = await load_analysis_test_results(session, user_id, require_all_categories=False)
    if not required_count or sum(result.category in REQUIRED_PORTRAIT_CATEGORIES for result in results) < required_count:
        raise HTTPException(status_code=400, detail="Пройди оставшиеся тесты, чтобы сформировать портрет.")

    test_groups = {}
    for key, category in PORTRAIT_CATEGORIES.items():
        tests = [result for result in results if result.category == category]
        if tests:
            test_groups[key] = tests
    evidence = json.dumps(
        {key: [{"test": result.name, "result": result.text} for result in tests] for key, tests in test_groups.items()},
        ensure_ascii=False,
    )
    check_prompt_size(PORTRAIT_PROMPT, evidence)
    ai_url, ai_token = ai_endpoint()
    if not ai_url or not ai_token:
        raise HTTPException(status_code=500, detail="AI сервис не настроен")

    await start_ai_job(session, user_id, "portrait", lambda charged: _generate_portrait(
        user_id, required_count, test_groups, evidence, ai_url, ai_token, charged,
    ))
    return {"status": "generating"}
