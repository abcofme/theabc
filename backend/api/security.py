import hashlib
import hmac
import json
import time
import urllib.parse
from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import APIKeyHeader
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.common import get_session
from backend.database.models import User
from backend.web_auth import SESSION_COOKIE, drop_session, read_session
from settings import settings

# Ожидаем токен в заголовке Authorization
header_scheme = APIKeyHeader(name="Authorization", auto_error=False)

# Сколько живёт подпись initData: без ограничения перехваченный заголовок работал бы вечно
INIT_DATA_MAX_AGE = 24 * 60 * 60
INIT_DATA_MAX_FUTURE_SKEW = 5 * 60


def require_same_origin(request: Request) -> None:
    origin = f"{request.url.scheme}://{request.url.netloc}"
    if request.headers.get("origin") != origin or request.headers.get("x-abc-csrf") != "1":
        raise HTTPException(status_code=403, detail="Запрос должен быть отправлен из приложения")


def browser_user_data(user: User) -> dict:
    from backend.password_auth import BROWSER_USER_ID, BROWSER_USER_NAME

    data = {"id": user.id, "first_name": user.tg_first_name, "username": user.username, "photo_url": user.photo_url}
    if user.id == BROWSER_USER_ID:
        data.update(first_name=BROWSER_USER_NAME, username=None, auth_provider="password", avatar_kind="logo")
    return data


async def validate_twa_data(
    request: Request,
    auth_header: str | None = Security(header_scheme),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if auth_header is None:
        user_data = await validate_browser_session(request, session)
        if request.headers.get("x-abc-account") != str(user_data["id"]):
            raise HTTPException(status_code=401, detail="Аккаунт в браузере изменился")
        return user_data
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid token format")

    pairs = urllib.parse.parse_qsl(auth_header.removeprefix("Bearer "), keep_blank_values=True)
    parsed_data = dict(pairs)
    hash_ = parsed_data.pop("hash", "")
    if len(parsed_data) != len(pairs) - 1 or len(hash_) != 64 or not hash_.isascii():
        raise HTTPException(status_code=401, detail="Invalid initData")

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed_data.items()))
    secret_key = hmac.new(b"WebAppData", settings.BOT_TOKEN.encode(), hashlib.sha256).digest()
    calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calculated_hash, hash_):
        raise HTTPException(status_code=401, detail="Invalid initData hash")

    try:
        auth_date = int(parsed_data["auth_date"])
        user_data = json.loads(parsed_data["user"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid initData") from None
    now = time.time()
    if not now - INIT_DATA_MAX_AGE <= auth_date <= now + INIT_DATA_MAX_FUTURE_SKEW:
        raise HTTPException(status_code=401, detail="initData expired")
    user_id = user_data.get("id") if isinstance(user_data, dict) else None
    if type(user_id) is not int or not 0 < user_id < 2**63:
        raise HTTPException(status_code=401, detail="Invalid initData user")
    user = await session.get(User, user_id)
    if user is None:
        # The Mini App can be opened directly, before the bot processes /start.
        profile = {}
        for field, source, limit in (("tg_first_name", "first_name", 64), ("tg_last_name", "last_name", 64), ("username", "username", 32)):
            value = user_data.get(source)
            if isinstance(value, str):
                profile[field] = value[:limit]
        await session.execute(insert(User).values(id=user_id, **profile).on_conflict_do_nothing(index_elements=[User.id]))
        await session.commit()
        user = await session.get(User, user_id)
    denied = user is None or user.banned
    await session.commit()
    if denied:
        raise HTTPException(status_code=401, detail="Вход недоступен. Напиши в поддержку через бота.")
    if "start_param" in parsed_data:
        user_data["start_param"] = parsed_data["start_param"]
    return user_data


async def validate_browser_session(request: Request, session: AsyncSession) -> dict:
    token = request.cookies.get(SESSION_COOKIE)
    if token and request.method not in {"GET", "HEAD", "OPTIONS"}:
        require_same_origin(request)
    user_id = await read_session(token) if token else None
    user = await session.get(User, user_id) if user_id is not None else None
    await session.commit()
    if user is None or user.banned:
        if user_id is not None:
            await drop_session(token)
        raise HTTPException(status_code=401, detail="Сессия закончилась, войдите снова")
    return browser_user_data(user)
