import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from aiogram.exceptions import TelegramBadRequest
from aiogram.methods import SendPhoto
from aiogram.types import FSInputFile, Message, PhotoSize

for key, value in {
    "BOT_TOKEN": "test-only-token", "WEB_APP_URL": "http://localhost", "ACCOUNT_ID": "test",
    "SECRET_KEY": "test", "BOT_LINK": "https://t.me/example", "REQUESTS_CHAT_ID": "1",
    "SUPPORT_CHAT_ID": "1", "POSTGRES_DB": "test", "POSTGRES_HOST": "localhost",
    "POSTGRES_PORT": "5432", "POSTGRES_USER": "test", "POSTGRES_PASSWORD": "test",
    "REDIS_PORT": "6379", "REDIS_DB": "0", "REDIS_HOST": "localhost", "REDIS_PASSWORD": "test",
}.items():
    os.environ.setdefault(key, value)

from settings import settings

with patch.object(settings, "BOT_TOKEN", "123456789:offline-test-token"):
    from backend.telegram.utils import media


class MemoryRedis:
    def __init__(self):
        self.values = {}

    async def get(self, key):
        return self.values.get(key)

    async def set(self, key, value, *, ex):
        self.values[key] = value.encode()


class TelegramMediaTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / "card.jpg"
        self.path.write_bytes(b"first version")
        self.redis = MemoryRedis()
        redis_patch = patch.object(media, "async_redis", self.redis)
        redis_patch.start()
        self.addCleanup(redis_patch.stop)
        self.calls = []
        self.message = Message.model_construct(photo=[
            PhotoSize(file_id="small", file_unique_id="small", width=40, height=40),
            PhotoSize(file_id="large", file_unique_id="large", width=100, height=100),
        ])

    async def send(self, value):
        self.calls.append(value)
        await asyncio.sleep(0)
        return self.message

    async def test_concurrent_requests_upload_once_for_the_same_bot_and_content(self):
        await asyncio.gather(
            media.send_cached_media(1, self.path, self.send),
            media.send_cached_media(1, self.path, self.send),
        )
        self.assertIsInstance(self.calls[0], FSInputFile)
        self.assertEqual(self.calls[1:], ["large"])

        await media.send_cached_media(2, self.path, self.send)
        self.assertIsInstance(self.calls[-1], FSInputFile)
        self.path.write_bytes(b"other version")
        await media.send_cached_media(1, self.path, self.send)
        self.assertIsInstance(self.calls[-1], FSInputFile)

    async def test_rejected_file_id_is_replaced_with_a_fresh_upload(self):
        await media.send_cached_media(1, self.path, self.send)
        self.calls.clear()

        async def send(value):
            if value == "large":
                self.calls.append(value)
                raise TelegramBadRequest(
                    method=SendPhoto(chat_id=1, photo=value),
                    message="Bad Request: wrong file identifier/HTTP URL specified",
                )
            self.calls.append(value)
            return Message.model_construct(photo=[
                PhotoSize(file_id="fresh", file_unique_id="fresh", width=100, height=100),
            ])

        await media.send_cached_media(1, self.path, send)
        await media.send_cached_media(1, self.path, send)
        self.assertEqual(self.calls[0], "large")
        self.assertIsInstance(self.calls[1], FSInputFile)
        self.assertEqual(self.calls[2:], ["fresh"])
