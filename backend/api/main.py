import time
from urllib.parse import urlsplit

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.common import run_in_background
from backend.api.routers import admin, auth, diary, friends, mailings, payments, portrait, profile, referral, reports, tests
from backend.performance import record_request
from settings import settings

app = FastAPI(title="TheABC Diary API")

# Фронтенд отдаётся с домена WEB_APP_URL. Когда прямой путь быстрый, он ходит в API через direct.<домен> —
# это другой origin, поэтому разрешаем фронтенд. max_age: preflight кэшируется (Chromium — до 2 часов)
_web_app = urlsplit(settings.WEB_APP_URL)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"{_web_app.scheme}://{_web_app.netloc}"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=7200,
)


class TimingMiddleware:
    """Время каждого запроса по маршруту — для отчета о производительности (backend/performance.py).
    Чистый ASGI, а не BaseHTTPMiddleware: потоковые ответы ИИ идут как есть, а время считается до последнего байта"""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        started = time.perf_counter()
        status = 500

        async def send_with_status(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_with_status)
        finally:
            # Маршрут с шаблоном (/api/diary/{entry_id}), а не сам путь; health дергают пробы и мониторинг
            route = getattr(scope.get("route"), "path", None)
            if route and route != "/api/health":
                ms = (time.perf_counter() - started) * 1000
                run_in_background(record_request(f"{scope['method']} {route}", status, ms))


app.add_middleware(TimingMiddleware)

for module in (auth, profile, diary, portrait, reports, tests, admin, mailings, friends, payments, referral):
    app.include_router(module.router)
