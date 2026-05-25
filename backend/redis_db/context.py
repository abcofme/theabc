from backend.redis_db import RedisWorker, async_redis

DELETE_KEY = 'delete'
EDIT_KEY = 'edit'
PREVIOUS_KEY = 'previous'
CONTEXT_KEY = 'context'


class ContextManager:
    def __init__(self, redis_client):
        self.redis_worker = RedisWorker(redis_client)

    async def get(self, user_id: int) -> dict:
        key = f"{CONTEXT_KEY}:{user_id}"
        user_data = await self.redis_worker.get_data(key) or {}
        await self.redis_worker.save_data(key, user_data)
        return user_data

    async def update(self, user_id: int, data: dict) -> None:
        key = f"{CONTEXT_KEY}:{user_id}"
        await self.redis_worker.save_data(key, data)

    async def get_section(self, user_id: int, section: str) -> tuple[dict, list]:
        key = f"{CONTEXT_KEY}:{user_id}"
        user_data = await self.redis_worker.get_data(key) or {}
        section_data = user_data.get(section)
        if section_data:
            return user_data, section_data
        else:
            section_data = []
            user_data[section] = section_data
        await self.redis_worker.save_data(key, user_data)
        return user_data, section_data


context_manager = ContextManager(async_redis)
