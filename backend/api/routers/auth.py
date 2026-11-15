import asyncio
import hashlib
import hmac

from fastapi import APIRouter, Depends, HTTPException, Request, Response, Security
from pydantic import BaseModel, Field, SecretStr
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.common import get_session
from backend.api.security import browser_user_data, header_scheme, require_same_origin, validate_browser_session, validate_twa_data
from backend.database.models import User
from backend.password_auth import BROWSER_USER_ID, BROWSER_USER_NAME, verify_password
from backend.redis_db import async_redis
from backend.web_auth import (
    LOGIN_PREFIX, LOGIN_TTL, SESSION_COOKIE, SESSION_TTL, claim_handoff, claim_legacy_session, claim_login,
    create_session, drop_session, new_handoff, new_login_code, read_handoff, read_session,
)
from settings import settings

router = APIRouter()
browser_auth = APIRouter(prefix="/api/auth", dependencies=[Depends(require_same_origin)])


class LoginCheck(BaseModel):
    code: str = Field(pattern=r"^[A-Za-z0-9_-]{35}$")
    secret: str = Field(pattern=r"^[A-Za-z0-9_-]{16}$")


class HandoffCode(BaseModel):
    code: str = Field(pattern=r"^[A-Za-z0-9_-]{24}$")


class HandoffClaim(HandoffCode):
    user_id: int = Field(ge=-(2**63), lt=2**63)


class PasswordLogin(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: SecretStr


async def _active_user(session: AsyncSession, user_id: int) -> User:
    user = await session.get(User, user_id)
    if not user or user.banned:
        raise HTTPException(status_code=403, detail="Вход недоступен. Напиши в поддержку через бота.")
    return user


async def _open_session(request: Request, response: Response, user: User, *, ttl: int = SESSION_TTL) -> dict:
    token = await create_session(user.id, ttl=ttl)
    previous_token = request.cookies.get(SESSION_COOKIE)
    if previous_token:
        await drop_session(previous_token)
    response.set_cookie(SESSION_COOKIE, token, max_age=ttl, secure=True, httponly=True, samesite="strict")
    return {"status": "ok", "user": browser_user_data(user)}


@browser_auth.post("/password")
async def password_login(req: PasswordLogin, request: Request, response: Response, session: AsyncSession = Depends(get_session)):
    if not settings.BROWSER_LOGIN_NAME or not settings.BROWSER_PASSWORD_HASH:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    address = request.client.host if request.client else "unknown"
    key = "password-login:" + hashlib.sha256(address.encode()).hexdigest()
    async with async_redis.pipeline(transaction=True) as pipe:
        pipe.incr(key)
        pipe.expire(key, 300, nx=True)
        attempts, _ = await pipe.execute()
    if attempts > 10:
        raise HTTPException(status_code=429, detail="Слишком много попыток. Попробуй через 5 минут.", headers={"Retry-After": "300"})
    password_valid = await asyncio.to_thread(verify_password, req.password.get_secret_value(), settings.BROWSER_PASSWORD_HASH)
    username_valid = hmac.compare_digest(req.username.encode(), settings.BROWSER_LOGIN_NAME.encode())
    if not (password_valid and username_valid):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    # Первый вход создаёт независимую учётную запись; последующие не сбрасывают её данные.
    await session.execute(insert(User).values(
        id=BROWSER_USER_ID, tg_first_name=BROWSER_USER_NAME,
        username=None, photo_url=None, admin=False, diary_reminders=False,
    ).on_conflict_do_nothing(index_elements=[User.id]))
    await session.commit()
    result = await _open_session(request, response, await _active_user(session, BROWSER_USER_ID))
    await async_redis.delete(key)
    return result


# Браузер: код для ссылки в бота и секрет, по которому браузер потом заберёт вход
@browser_auth.post("/login")
async def start_login():
    code, secret = new_login_code()
    return {"code": code, "secret": secret, "url": f"{settings.BOT_LINK}?start={LOGIN_PREFIX}{code}", "expires_in": LOGIN_TTL}


# Браузер спрашивает, подтвердили ли вход в боте: pending, expired или ok с сессией
@browser_auth.post("/login/check")
async def check_login(req: LoginCheck, request: Request, response: Response, session: AsyncSession = Depends(get_session)):
    status, user_id = await claim_login(req.code, req.secret)
    if status != "ok":
        return {"status": status}
    return await _open_session(request, response, await _active_user(session, user_id))


@router.get("/api/auth/session")
async def browser_session(request: Request, session: AsyncSession = Depends(get_session)):
    return {"status": "ok", "user": await validate_browser_session(request, session)}


@browser_auth.post("/session/migrate")
async def migrate_browser_session(
    request: Request, response: Response, auth_header: str | None = Security(header_scheme),
    session: AsyncSession = Depends(get_session),
):
    existing_token = request.cookies.get(SESSION_COOKIE)
    if existing_token and await read_session(existing_token) is not None:
        return {"status": "ok", "user": await validate_browser_session(request, session)}
    token = (auth_header or "").removeprefix("Session ")
    if not (auth_header and auth_header.startswith("Session ") and len(token) == 43 and token.isascii()):
        raise HTTPException(status_code=401, detail="Сессия закончилась, войдите снова")
    user_id, ttl = await claim_legacy_session(token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Сессия закончилась, войдите снова")
    return await _open_session(request, response, await _active_user(session, user_id), ttl=ttl)


# Мини-апп: одноразовая ссылка, которая откроет приложение в браузере уже со входом
@router.post("/api/auth/handoff")
async def start_handoff(user_data: dict = Depends(validate_twa_data)):
    return {"code": await new_handoff(user_data["id"])}


@browser_auth.post("/handoff/preview")
async def preview_handoff(req: HandoffCode, session: AsyncSession = Depends(get_session)):
    user_id = await read_handoff(req.code)
    if user_id is None:
        raise HTTPException(status_code=410, detail="Ссылка для входа устарела — войди через Telegram")
    user = await _active_user(session, user_id)
    return {"id": user.id, "first_name": user.tg_first_name, "username": user.username}


@browser_auth.post("/handoff/claim")
async def finish_handoff(req: HandoffClaim, request: Request, response: Response, session: AsyncSession = Depends(get_session)):
    if await read_handoff(req.code) != req.user_id:
        raise HTTPException(status_code=410, detail="Ссылка для входа устарела — войди через Telegram")
    user_id = await claim_handoff(req.code)
    if user_id != req.user_id:
        raise HTTPException(status_code=410, detail="Ссылка для входа устарела — войди через Telegram")
    return await _open_session(request, response, await _active_user(session, user_id))


@browser_auth.post("/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        user_id = await read_session(token)
        if user_id is not None and request.headers.get("x-abc-account") != str(user_id):
            raise HTTPException(status_code=409, detail="Аккаунт в браузере изменился")
        await drop_session(token)
    response.delete_cookie(SESSION_COOKIE, secure=True, httponly=True, samesite="strict")
    return {"status": "ok"}


router.include_router(browser_auth)
