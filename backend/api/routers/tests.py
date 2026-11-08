from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.api.common import get_session
from backend.api.security import validate_twa_data
from backend.bonuses import award, passed_all_portrait_tests
from backend.database.models import Test, Question, Answer, Progress, Result
from backend.telegram.views.hardcoded_tests import get_hardcoded_test_result
from backend.progress import lock_user_progress, save_test_progress

router = APIRouter()


class SubmitTestRequest(BaseModel):
    answer_ids: List[int]

@router.get("/api/tests/{test_id}")
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

@router.post("/api/tests/{test_id}/submit")
async def submit_test(
    test_id: int,
    payload: SubmitTestRequest,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    try:
        user_id = user_data.get("id")
        await lock_user_progress(session, user_id)
        progress_query = select(Progress).where(Progress.test_id == test_id, Progress.user_id == user_id)
        progress = (await session.execute(progress_query)).scalars().first()
        if progress:
            return {"result": "Вы уже прошли этот тест."}
        
        query = select(Test).options(selectinload(Test.category)).where(Test.id == test_id)
        test = (await session.execute(query)).scalar_one_or_none()
        
        if not test:
            raise HTTPException(status_code=404, detail="Тест не найден")

        answers_query = select(Answer).where(Answer.id.in_(payload.answer_ids))
        answers = (await session.execute(answers_query)).scalars().all()
        question_ids = set((await session.scalars(select(Question.id).where(Question.test_id == test_id))).all())
        if (
            not question_ids
            or len(answers) != len(payload.answer_ids)
            or len(answers) != len(question_ids)
            or {answer.question_id for answer in answers} != question_ids
        ):
            raise HTTPException(status_code=422, detail="Нужен один ответ на каждый вопрос теста")
        
        if test.hardcode_test:
            result_text = get_hardcoded_test_result(answers, test)
            progress = Progress(
                test_id=test_id,
                user_id=user_id,
                value=0,
                hardcode_value=result_text
            )
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
            result_text = result_obj.name if result_obj and result_obj.name else "Результат не найден"
            
        save_test_progress(session, progress)
        await session.commit()

        await award(user_id, "first_test")
        if await passed_all_portrait_tests(session, user_id):
            await award(user_id, "all_tests")
        return {"result": result_text}
    except HTTPException:
        raise
    except Exception:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal Error")

@router.delete("/api/tests/{test_id}/progress")
async def delete_test_progress(
    test_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    from sqlalchemy import delete
    await lock_user_progress(session, user_id)
    await session.execute(delete(Progress).where(Progress.test_id == test_id, Progress.user_id == user_id))
    await session.commit()
    return {"status": "ok"}

