import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


class BrowserPaymentTest(unittest.IsolatedAsyncioTestCase):
    async def test_cookie_authenticated_browser_can_buy_without_authorization_header(self):
        config = {
            "BOT_TOKEN": "test-only-token", "WEB_APP_URL": "http://localhost", "ACCOUNT_ID": "test",
            "SECRET_KEY": "test", "BOT_LINK": "https://t.me/example", "REQUESTS_CHAT_ID": "1",
            "SUPPORT_CHAT_ID": "1", "POSTGRES_DB": "test", "POSTGRES_HOST": "localhost", "POSTGRES_PORT": "5432",
            "POSTGRES_USER": "test", "POSTGRES_PASSWORD": "test", "REDIS_PORT": "6379",
            "REDIS_DB": "0", "REDIS_HOST": "localhost", "REDIS_PASSWORD": "test",
        }
        with patch.dict(os.environ, config):
            from backend.api.routers import payments
            from backend.web_auth import SESSION_COOKIE

        app = FastAPI()
        app.include_router(payments.router)
        session = AsyncMock(spec=AsyncSession)
        session.get.return_value = SimpleNamespace(banned=False, yookassa_payment_method_id=None)
        app.dependency_overrides[payments.get_session] = lambda: session
        with (
            patch("backend.api.security.read_session", new_callable=AsyncMock, return_value=123),
            patch("backend.api.security.browser_user_data", return_value={"id": 123}),
            patch.object(payments, "_create_payment", new_callable=AsyncMock, return_value=("https://pay.example/order", "test-order")) as create,
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="https://test",
                cookies={SESSION_COOKIE: "session"}, headers={
                    "Origin": "https://test", "X-ABC-CSRF": "1", "X-ABC-Account": "123",
                },
            ) as client:
                for route, payload in (("/api/subscription/buy", {}), ("/api/balance/topup", {"amount": payments.MIN_TOPUP})):
                    with self.subTest(route=route):
                        response = await client.post(route, json=payload)
                        self.assertEqual(response.status_code, 200)
                        self.assertEqual(response.json()["payment_id"], "test-order")
                        self.assertIsNone(create.await_args.kwargs["return_url"])
        self.assertEqual(create.await_count, 2)
