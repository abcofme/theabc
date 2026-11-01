from fastapi import APIRouter, Depends, HTTPException, Security
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.common import get_session
from backend.api.security import header_scheme, validate_twa_data
from backend.database.models import User
from backend.web_auth import (
    LOGIN_PREFIX, LOGIN_TTL, claim_handoff, claim_login, create_session, drop_session, new_handoff, new_login_code,
)
from settings import settings

router = APIRouter()


class LoginCheck(BaseModel):
    code: str
    secret: str


class HandoffClaim(BaseModel):
    code: str


async def _open_session(session: AsyncSession, user_id: int) -> dict:
    user = await session.get(User, user_id)
    if not user or user.banned:
        raise HTTPException(status_code=403, detail="Вход недоступен. Напиши в поддержку через бота.")
    # Как user из initData: id, имя и ник нужны API (админы, имя в совместимости), фото — шапке профиля
    user_data = {"id": user.id, "first_name": user.tg_first_name, "username": user.username}
    token = await create_session(user_data)
    return {"status": "ok", "token": token, "user": {**user_data, "photo_url": user.photo_url}}


# Браузер: код для ссылки в бота и секрет, по которому браузер потом заберёт вход
@router.post("/api/auth/login")
async def start_login():
    code, secret = new_login_code()
    return {"code": code, "secret": secret, "url": f"{settings.BOT_LINK}?start={LOGIN_PREFIX}{code}", "expires_in": LOGIN_TTL}


# Браузер спрашивает, подтвердили ли вход в боте: pending, expired или ok с сессией
@router.post("/api/auth/login/check")
async def check_login(req: LoginCheck, session: AsyncSession = Depends(get_session)):
    status, user_id = await claim_login(req.code, req.secret)
    if status != "ok":
        return {"status": status}
    return await _open_session(session, user_id)


# Мини-апп: одноразовая ссылка, которая откроет приложение в браузере уже со входом
@router.post("/api/auth/handoff")
async def start_handoff(user_data: dict = Depends(validate_twa_data)):
    return {"code": await new_handoff(user_data["id"])}


@router.post("/api/auth/handoff/claim")
async def finish_handoff(req: HandoffClaim, session: AsyncSession = Depends(get_session)):
    user_id = await claim_handoff(req.code)
    if not user_id:
        raise HTTPException(status_code=410, detail="Ссылка для входа устарела — войди через Telegram")
    return await _open_session(session, user_id)


@router.post("/api/auth/logout")
async def logout(auth_header: str = Security(header_scheme)):
    if auth_header.startswith("Session "):
        await drop_session(auth_header.removeprefix("Session "))
    return {"status": "ok"}
