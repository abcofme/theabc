from urllib.parse import urlsplit

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routers import admin, diary, friends, payments, portrait, profile, reports, tests
from settings import settings

app = FastAPI(title="TheABC Diary API")

# Фронтенд отдаётся с того же домена, что и API, поэтому разрешаем только его
_web_app = urlsplit(settings.WEB_APP_URL)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"{_web_app.scheme}://{_web_app.netloc}"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (profile, diary, portrait, reports, tests, admin, friends, payments):
    app.include_router(module.router)
