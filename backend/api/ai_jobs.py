from fastapi import HTTPException
from loguru import logger

from backend.api.common import run_in_background
from backend.billing import charge, refund

MAX_ACTIVE_AI_JOBS = 4
MAX_AI_PROMPT_CHARS = 120_000
# The API runs in a single worker. All tracked jobs occupy a slot until their storage/credit work ends.
_active_users: set[int] = set()


def check_prompt_size(*parts: str):
    if sum(map(len, parts)) > MAX_AI_PROMPT_CHARS:
        raise HTTPException(413, "Слишком много текста для одного запроса к ИИ. Попробуй сократить объём.")


async def start_ai_job(session, user_id, feature, job, *, prepare=None):
    if user_id in _active_users:
        raise HTTPException(429, "У тебя уже выполняется запрос к ИИ. Дождись его завершения.")
    if len(_active_users) >= MAX_ACTIVE_AI_JOBS:
        raise HTTPException(503, "Сейчас ИИ занят. Попробуй чуть позже.", headers={"Retry-After": "10"})
    _active_users.add(user_id)
    charged = None
    try:
        if prepare is not None:
            await prepare()
        charged = await charge(session, user_id, feature)
        if charged is None:
            # Premium has no debit transaction to commit. Close its read transaction before waiting on the provider.
            await session.commit()
        task = run_in_background(_run_job(user_id, charged, job))
        task.add_done_callback(_record_job_error)
        return task
    except BaseException:
        _active_users.discard(user_id)
        if charged is not None:
            await refund(user_id, charged)
        raise


async def _run_job(user_id, charged, job):
    try:
        return await job(charged)
    except BaseException:
        if charged is not None:
            try:
                await refund(user_id, charged)
            except Exception as error:
                logger.error("AI token restore failed: {}", type(error).__name__)
        raise
    finally:
        _active_users.discard(user_id)


def _record_job_error(task):
    if not task.cancelled() and (error := task.exception()) is not None:
        logger.error("AI background job failed: {}", type(error).__name__)
