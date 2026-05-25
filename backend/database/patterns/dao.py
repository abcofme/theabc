from typing import NoReturn, TypeVar, Type, Union, Sequence, Any, Optional, List

import asyncpg
from loguru import logger
from sqlalchemy import select, Delete, delete, Update, update, func
from sqlalchemy.exc import IntegrityError, InterfaceError
from sqlalchemy.ext.asyncio.session import AsyncSession

from backend.database import engine
from backend.database.models import BaseModel

T = TypeVar('T', bound=BaseModel)


class DataAccessObject:
    def __init__(self, session: AsyncSession) -> NoReturn:
        self.session: AsyncSession = session

    async def reconnect(self) -> None:
        try:
            async with AsyncSession(engine, expire_on_commit=False) as session:
                self.session = session
        except (InterfaceError, asyncpg.InterfaceError) as e:
            logger.error(f"Не удалось переподключиться к базе данных: {e}")
            raise e

    #  Get object from id
    async def get_object(
            self, db_object: Type[T], db_object_id: int = None,
            options: Optional[List[Any]] = None
    ) -> Union[T, None]:
        try:
            async with self.session.begin():
                query = select(db_object)
                if options:
                    query = query.options(*options)
                if db_object_id:
                    query = query.where(db_object.id == db_object_id)
                else:
                    return None
                results = await self.session.execute(query)
                return results.scalars().first()
        except (InterfaceError, asyncpg.InterfaceError):
            await self.reconnect()
            return await self.get_object(db_object, db_object_id, options)

    # Get list of objects by list of IDs
    async def get_objects_by_ids(
            self, db_object: Type[T], db_object_ids: List[int],
            options: Optional[List[Any]] = None
    ) -> Sequence[T]:
        try:
            async with self.session.begin():
                query = select(db_object).where(db_object.id.in_(db_object_ids))
                if options:
                    query = query.options(*options)
                results = await self.session.execute(query)
                return results.scalars().all()
        except (InterfaceError, asyncpg.InterfaceError):
            await self.reconnect()
            return await self.get_objects_by_ids(db_object, db_object_ids, options)

    #  Get all objects
    async def get_all(
            self, db_object: Type[T]
    ) -> Sequence[T]:
        try:
            async with self.session.begin():
                query = select(db_object)
                results = await self.session.execute(query)
                return results.scalars().all()
        except (InterfaceError, asyncpg.InterfaceError):
            await self.reconnect()
            return await self.get_all(db_object)

    #  Delete object
    async def delete_object(
            self, db_object: Type[T], db_object_id: int
    ) -> bool:
        try:
            async with self.session.begin():
                query: Delete = delete(db_object).where(db_object.id == db_object_id)
                result = await self.session.execute(query)
                return bool(result.rowcount)
        except (InterfaceError, asyncpg.InterfaceError):
            await self.reconnect()
            return await self.delete_object(db_object, db_object_id)

    #  Update object
    async def update_object(
            self, db_object: Type[T], db_object_id: int, update_data: dict
    ) -> bool:
        try:
            async with self.session.begin():
                query: Update = update(db_object).where(db_object.id == db_object_id).values(update_data)
                result = await self.session.execute(query)
                return bool(result.rowcount)
        except (InterfaceError, asyncpg.InterfaceError):
            await self.reconnect()
            return await self.update_object(db_object, db_object_id, update_data)

    #  Create object
    async def add_object(
            self,
            db_object: Type[T],
            autoincrement: bool = True
    ) -> bool:
        try:
            async with self.session.begin():
                try:
                    if autoincrement:
                        max_id = (await self.session.execute(func.max(db_object.__table__.c.id))).scalar() or 0
                        db_object.id = max_id + 1
                    self.session.add(db_object)
                    await self.session.commit()
                    return True
                except IntegrityError as e:
                    print(e.__str__())
                    return False
        except (InterfaceError, asyncpg.InterfaceError):
            await self.reconnect()
            return await self.add_object(db_object, autoincrement)

    #  Get filtered objects
    async def filter(
            self, db_object: Type[T], conditions: dict[str, Any],
            options: Optional[List[Any]] = None
    ) -> Sequence[T]:
        try:
            async with self.session.begin():
                query = select(db_object).filter_by(**conditions)
                if options:
                    query = query.options(*options)
                results = await self.session.execute(query)
                return results.scalars().all()
        except (InterfaceError, asyncpg.InterfaceError):
            await self.reconnect()
            return await self.filter(db_object, conditions, options)

    #  Get count objects
    async def count_objects(self, db_object: Type[T], conditions: dict[str, Any] = None) -> int:
        try:
            async with self.session.begin():
                query = select(func.count()).select_from(db_object)
                if conditions:
                    query = query.filter_by(**conditions)
                result = await self.session.execute(query)
                return result.scalar()
        except (InterfaceError, asyncpg.InterfaceError):
            await self.reconnect()
            return await self.count_objects(db_object, conditions)

    async def refresh(self, db_object: T) -> T:
        try:
            async with self.session.begin():
                await self.session.refresh(db_object)
                return db_object
        except (InterfaceError, asyncpg.InterfaceError):
            await self.reconnect()
            return await self.refresh(db_object)

    #  Create object
    async def update_or_create(
            self,
            db_object: T,
            autoincrement: bool = True
    ) -> None:
        try:
            async with self.session.begin():
                async def _get() -> Union[T, None]:
                    query = select(db_object.__class__)
                    if db_object.id:
                        query = query.where(db_object.__table__.c.id == db_object.id)
                        results = await self.session.execute(query)
                        return results.scalars().first()
                    else:
                        return None

                async def _add():
                    try:
                        if autoincrement:
                            max_id = (await self.session.execute(func.max(db_object.__table__.c.id))).scalar() or 1
                            db_object.id = max_id + 1
                        self.session.add(db_object)
                        await self.session.commit()
                        return True
                    except IntegrityError as e:
                        print(e.__str__())
                        return False

                exist = await _get()
                if exist:
                    await self.session.merge(db_object)
                    await self.session.commit()
                else:
                    await _add()
        except (InterfaceError, asyncpg.InterfaceError):
            await self.reconnect()
            return await self.update_or_create(db_object, autoincrement)
