import asyncio

from fastapi.responses import JSONResponse


class RequestLimits:
    """Bound JSON uploads before routing, including endpoints that parse JSON manually."""

    def __init__(self, app):
        self.app = app
        self.readers = 0

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH", "DELETE"}:
            return await self.app(scope, receive, send)
        path = scope["path"].rstrip("/")
        if not path.startswith("/api/") or path == "/api/diary/transcribe":
            return await self.app(scope, receive, send)
        limit = 64 * 1024 if path == "/api/webhook/yookassa" else 512 * 1024

        async def reject(status, detail):
            response = JSONResponse({"detail": detail}, status_code=status, headers={"Cache-Control": "no-store"})
            await response(scope, receive, send)

        declared = dict(scope["headers"]).get(b"content-length")
        if declared and (len(declared) > 12 or not declared.isdigit() or int(declared) > limit):
            return await reject(413, "Запрос слишком большой")
        if self.readers >= 48:
            return await reject(503, "Сервер занят. Попробуй чуть позже.")

        body = bytearray()
        self.readers += 1
        try:
            async with asyncio.timeout(20):
                while True:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return
                    chunk = message.get("body", b"")
                    if len(body) + len(chunk) > limit:
                        return await reject(413, "Запрос слишком большой")
                    body.extend(chunk)
                    if not message.get("more_body", False):
                        break
        except TimeoutError:
            return await reject(408, "Истекло время отправки запроса")
        finally:
            self.readers -= 1

        payload = bytes(body)
        del body

        async def replay():
            nonlocal payload
            if payload is None:
                return await receive()
            message = {"type": "http.request", "body": payload, "more_body": False}
            payload = None
            return message

        await self.app(scope, replay, send)
