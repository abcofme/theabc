"""Вход в «Азбуку Я» из обычного браузера и установленного приложения, без Telegram WebApp.

Сайт берёт код входа и ведёт в бота по ссылке t.me/<бот>?start=login_<код>. В боте пользователь подтверждает
вход, а сайт тем временем спрашивает, подтверждён ли код, и получает сессию. Код подписан и сам помнит свой срок,
поэтому в Redis попадают только подтверждённые. Забрать вход может только тот, у кого секрет из ответа сайту:
ссылку с кодом видно, секрет — нет.

Из мини-аппа в браузер ведёт одноразовая ссылка ?login=<код> (handoff): пользователь уже подтверждён Telegram"""
import base64
import hashlib
import hmac
import json
import secrets
import time

from backend.redis_db import async_redis
from settings import settings

# Ссылка в бота: t.me/<бот>?start=login_<код>
LOGIN_PREFIX = "login_"
LOGIN_TTL = 10 * 60
HANDOFF_TTL = 10 * 60
# Сессия продлевается при каждом запросе: выкидывает только после полугода без входа
SESSION_TTL = 180 * 24 * 60 * 60

_KEY = hmac.new(b"web-login", settings.BOT_TOKEN.encode(), hashlib.sha256).digest()
_NONCE_LEN, _EXPIRES_LEN = 12, 7
_CODE_LEN = _NONCE_LEN + _EXPIRES_LEN + 16


def _sign(*parts: str) -> str:
    digest = hmac.new(_KEY, ":".join(parts).encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest[:12]).decode()


def _base36(n: int) -> str:
    digits = ""
    while n:
        n, rest = divmod(n, 36)
        digits = "0123456789abcdefghijklmnopqrstuvwxyz"[rest] + digits
    return digits.rjust(_EXPIRES_LEN, "0")


def new_login_code() -> tuple[str, str]:
    """(код для ссылки в бота, секрет сайта). Код укладывается в параметр /start: до 64 символов A-Za-z0-9_-"""
    nonce = secrets.token_urlsafe(9)
    expires = _base36(int(time.time()) + LOGIN_TTL)
    return nonce + expires + _sign("code", nonce, expires), _sign("secret", nonce)


def parse_login_code(code: str, grace: int = 0) -> str | None:
    """nonce кода, если подпись верна и срок (плюс grace секунд) не вышел"""
    if len(code) != _CODE_LEN:
        return None
    nonce, expires, signature = code[:_NONCE_LEN], code[_NONCE_LEN:-16], code[-16:]
    if not hmac.compare_digest(signature, _sign("code", nonce, expires)):
        return None
    try:
        deadline = int(expires, 36)
    except ValueError:
        return None
    return nonce if time.time() <= deadline + grace else None


async def confirm_login(code: str, user_id: int) -> bool:
    """Пользователь нажал «Войти» в боте"""
    nonce = parse_login_code(code)
    if not nonce:
        return False
    await async_redis.set(f"weblogin:{nonce}", user_id, ex=LOGIN_TTL)
    return True


async def claim_login(code: str, secret: str) -> tuple[str, int | None]:
    """('ok', id пользователя) один раз после подтверждения, иначе ('pending', None) или ('expired', None).
    Подтвердить можно до конца срока кода, поэтому забрать вход — ещё LOGIN_TTL после него"""
    nonce = parse_login_code(code, grace=LOGIN_TTL)
    if not nonce or not hmac.compare_digest(secret, _sign("secret", nonce)):
        return "expired", None
    user_id = await async_redis.getdel(f"weblogin:{nonce}")
    if user_id:
        return "ok", int(user_id)
    return ("pending" if parse_login_code(code) else "expired"), None


async def new_handoff(user_id: int) -> str:
    code = secrets.token_urlsafe(18)
    await async_redis.set(f"webhandoff:{code}", user_id, ex=HANDOFF_TTL)
    return code


async def claim_handoff(code: str) -> int | None:
    user_id = await async_redis.getdel(f"webhandoff:{code}")
    return int(user_id) if user_id else None


def _session_key(token: str) -> str:
    # В Redis лежит хэш: утечка базы не даёт готовых токенов
    return "websession:" + hashlib.sha256(token.encode()).hexdigest()


async def create_session(user_data: dict) -> str:
    token = secrets.token_urlsafe(32)
    await async_redis.set(_session_key(token), json.dumps(user_data), ex=SESSION_TTL)
    return token


async def read_session(token: str) -> dict | None:
    raw = await async_redis.getex(_session_key(token), ex=SESSION_TTL)
    return json.loads(raw) if raw else None


async def drop_session(token: str):
    await async_redis.delete(_session_key(token))
