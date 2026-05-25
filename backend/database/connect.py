from sqlalchemy import MetaData
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    AsyncEngine,
    create_async_engine,
    async_sessionmaker, AsyncConnection,
)


def create_async_engine_db(
        url: str,
        echo: bool,
) -> AsyncEngine:
    return create_async_engine(url=url, echo=echo)


def async_session_db(
        engine: AsyncEngine,
        expire_on_commit: bool,
) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine=engine, expire_on_commit=expire_on_commit)


async def create_all_tables(engine: AsyncEngine, metadata: MetaData):
    async with engine.begin() as connection:
        connection: AsyncConnection
        await connection.run_sync(metadata.create_all)
