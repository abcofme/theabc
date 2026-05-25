import json

from redis import asyncio as aioredis
from redis.asyncio import Redis

from settings import settings

# FOR LOCAL
# redis_args = dict(
#     host=settings.REDIS_HOST or 'redis',
#     port=settings.REDIS_PORT,
#     db=0
# )

# FOR DOCKER
redis_args = dict(
    host='redis',
    port=settings.REDIS_PORT,
    db=0,
    password=settings.REDIS_PASSWORD
)
async_redis = aioredis.Redis(**redis_args)


class RedisWorker:
    def __init__(self, redis_client: Redis):
        self.redis_client = redis_client

    async def get_data(self, key):
        data = await self.redis_client.get(key)
        if data:
            return json.loads(data)
        return None

    async def save_data(self, key, data):
        await self.redis_client.set(key, json.dumps(data))
