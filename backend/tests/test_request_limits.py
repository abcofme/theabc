import unittest

from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient

from backend.api.limits import RequestLimits


class RequestLimitsTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        app = FastAPI()
        app.add_middleware(RequestLimits)
        self.received = []

        @app.post("/api/webhook/yookassa")
        @app.post("/api/example")
        async def receiver(request: Request):
            self.received.append(await request.body())
            return {"ok": True}

        self.client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
        self.addAsyncCleanup(self.client.aclose)

    async def test_replays_complete_body_for_handler(self):
        response = await self.client.post("/api/example", content=b"example")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.received, [b"example"])

    async def test_callback_uses_smaller_length_limit_before_handler(self):
        response = await self.client.post("/api/webhook/yookassa", content=b"a" * (64 * 1024 + 1))
        self.assertEqual(response.status_code, 413)
        self.assertEqual(self.received, [])

    async def test_applies_same_limit_without_content_length(self):
        async def body():
            yield b"a" * (64 * 1024)
            yield b"a"

        response = await self.client.post("/api/webhook/yookassa", content=body())
        self.assertEqual(response.status_code, 413)
        self.assertEqual(self.received, [])
