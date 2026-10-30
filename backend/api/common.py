import asyncio

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import async_session
from backend.database.models import User
from settings import settings

# Админы веб-панели — флаг users.admin. Ники — запасной вариант для тех, кому флаг ещё не выставлен
ADMIN_USERNAMES = {"ingenfrid", "key_crp", "fondlife"}


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session


def avatar_url(user) -> str | None:
    # photo_url появляется, только если Telegram сам передал фото в initData
    return f"/api/avatar/{user.id}" if user and user.photo_url else None


def is_admin(user, username: str | None = None) -> bool:
    if user and user.admin:
        return True
    return bool({user.username if user else None, username} & ADMIN_USERNAMES)


async def require_admin(user_data: dict, session: AsyncSession) -> User:
    user = await session.get(User, user_data.get("id"))
    if not is_admin(user, user_data.get("username")):
        raise HTTPException(status_code=403, detail="Access denied")
    return user


# Ссылки на фоновые задачи, иначе сборщик мусора может прервать их до конца
_background_tasks: set = set()


def run_in_background(coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return task


# Все функции с ИИ (портрет, отчёты, разбор записи, совместимость, импорт тестов) ходят к одному
# агенту Timeweb Cloud AI. Модель задана в настройках агента (сейчас Claude Haiku 5.5): поле model в запросе он игнорирует
AI_MODEL = "claude-haiku-5-5"

# Все тексты приложения одинаково подходят мужчине и женщине — ответы ИИ тоже
GENDER_NEUTRAL_RULE = """ГЕНДЕРНО НЕЙТРАЛЬНЫЙ ЯЗЫК (обязательно)

Текст должен одинаково подходить мужчине и женщине. Обращаясь к человеку, не используй формы, по которым виден пол:
— глаголы прошедшего времени: не «ты сделал», «ты почувствовала»;
— краткие прилагательные и причастия: не «ты готов», «ты уверена», «ты склонен»;
— прилагательные о самом человеке: не «ты был спокойным», «ты сильная»;
— варианты через скобки и слэш: не «сделал(а)», «рад/рада».
Перестраивай фразу: настоящее время, существительные, безличные обороты и слово «человек» — «тебе удалось», «у тебя получилось», «в таких ситуациях ты действуешь спокойно», «появилась уверенность», «реакция была резкой», «ты — внимательный человек». С «вы» — только формы множественного числа: «вы готовы», «вы сделали»."""


def ai_endpoint() -> tuple[str | None, str | None]:
    """URL chat/completions агента и его токен; None, если не настроены"""
    url, token = settings.TIMEWEB_AI_URL, settings.TIMEWEB_AI_TOKEN
    if url and not url.endswith("/chat/completions"):
        url = url.rstrip("/") + "/chat/completions"
    return url, token
