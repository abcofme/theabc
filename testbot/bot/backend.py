"""Клиент служебного API основного бэкенда (backend/api/service.py)."""
import time

import httpx
from aiogram.types import User

from . import config


class BackendError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(f"{status}: {detail}")
        self.status = status
        self.detail = detail


def _user_payload(user: User) -> dict:
    return {
        "id": user.id,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "username": user.username,
    }


class Backend:
    # Вопросы теста одинаковы для всех — кэшируем, чтобы не ходить в API на каждый ответ
    TEST_CACHE_TTL = 5 * 60

    def __init__(self):
        self._client = httpx.AsyncClient(
            base_url=config.BACKEND_URL + "/api/service",
            headers={"X-Service-Token": config.SERVICE_API_TOKEN},
            timeout=15,
        )
        self._tests: dict[int, tuple[float, dict]] = {}

    async def close(self):
        await self._client.aclose()

    async def _request(self, method: str, url: str, **kwargs) -> dict:
        try:
            response = await self._client.request(method, url, **kwargs)
        except httpx.HTTPError as e:
            raise BackendError(0, repr(e))
        if response.status_code >= 400:
            try:
                detail = response.json().get("detail", response.text)
            except ValueError:
                detail = response.text
            raise BackendError(response.status_code, str(detail))
        return response.json()

    async def upsert_user(self, user: User):
        await self._request("POST", "/users", json=_user_payload(user))

    async def catalog(self, user_id: int) -> list[dict]:
        return (await self._request("GET", "/catalog", params={"user_id": user_id}))["categories"]

    async def test(self, test_id: int, user_id: int) -> dict:
        test = await self._request("GET", f"/tests/{test_id}", params={"user_id": user_id})
        self._tests[test_id] = (time.monotonic(), test)
        return test

    async def test_questions(self, test_id: int, user_id: int) -> dict:
        cached = self._tests.get(test_id)
        if cached and time.monotonic() - cached[0] < self.TEST_CACHE_TTL:
            return cached[1]
        return await self.test(test_id, user_id)

    def forget_test(self, test_id: int):
        self._tests.pop(test_id, None)

    async def submit(self, test_id: int, user: User, answer_ids: list[int]) -> str:
        data = await self._request(
            "POST", f"/tests/{test_id}/submit",
            json={"user": _user_payload(user), "answer_ids": answer_ids},
        )
        return data["result"]

    async def reset(self, test_id: int, user_id: int):
        await self._request("DELETE", f"/tests/{test_id}/progress", params={"user_id": user_id})
