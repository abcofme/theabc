import os


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Environment variable {name} is not set")
    return value


BOT_TOKEN = _require("BOT_TOKEN")
BACKEND_URL = _require("BACKEND_URL").rstrip("/")
SERVICE_API_TOKEN = _require("SERVICE_API_TOKEN")
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
MAIN_BOT_URL = os.environ.get("MAIN_BOT_URL", "https://t.me/abcofmebot")

# Незавершённый тест хранится в Redis 30 дней, потом начинается заново
PROGRESS_TTL = 30 * 24 * 60 * 60
