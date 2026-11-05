"""Отдельный браузерный аккаунт. Отрицательный ID не пересекается с Telegram user ID."""
import hashlib
import hmac
import secrets

BROWSER_USER_ID = -1
BROWSER_USER_NAME = "Тестовый пользователь"


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return f"scrypt${salt}${digest}"


def verify_password(password: str, encoded: str) -> bool:
    if len(password) > 1024:
        return False
    try:
        scheme, salt, expected = encoded.split("$")
        if scheme != "scrypt" or len(salt) != 32 or len(expected) != 128:
            return False
        actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False
