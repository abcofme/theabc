from backend.database.connect import create_async_engine_db, async_session_db
from settings import settings
from . import (
    models
)

engine = create_async_engine_db(url=settings.url, echo=False)
async_session = async_session_db(engine=engine, expire_on_commit=False)
