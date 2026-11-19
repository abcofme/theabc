from asyncio import Lock, to_thread
from collections import defaultdict
from collections.abc import Awaitable, Callable
from contextlib import suppress
from functools import lru_cache
from hashlib import file_digest
from pathlib import Path, PurePath
from typing import TypeVar

from aiogram.exceptions import TelegramBadRequest
from aiogram.types import FSInputFile, Message
from redis.exceptions import RedisError

from backend.redis_db import async_redis

MediaResult = TypeVar("MediaResult", bound=Message | bool)
_upload_locks: dict[Path, Lock] = defaultdict(Lock)
_REJECTED_FILE_ID = (
    "wrong file identifier",
    "file identifier is not specified",
    "invalid file id",
    "invalid file_id",
    "file_reference",
    "file reference",
)


@lru_cache(maxsize=32)
def _content_digest(path: Path, mtime_ns: int, ctime_ns: int, size: int) -> str:
    # Метаданные меняют ключ локального кеша, хеш содержимого переживает пересборку образа.
    with path.open("rb") as file:
        return file_digest(file, "sha256").hexdigest()


async def _get_file_id(key: str) -> str | None:
    with suppress(RedisError):
        value = await async_redis.get(key)
        if value:
            return value.decode()
    return None


async def _try_cached_media(
    send: Callable[[str | FSInputFile], Awaitable[MediaResult]], file_id: str
) -> MediaResult | None:
    try:
        return await send(file_id)
    except TelegramBadRequest as exc:
        if not any(reason in exc.message.lower() for reason in _REJECTED_FILE_ID):
            raise
        return None


async def send_cached_media(
    bot_id: int, path: PurePath, send: Callable[[str | FSInputFile], Awaitable[MediaResult]]
) -> MediaResult:
    """Загрузить изображение или видео один раз и повторно отправлять через Telegram file_id."""
    path = Path(path)
    stat = path.stat()
    digest = await to_thread(_content_digest, path, stat.st_mtime_ns, stat.st_ctime_ns, stat.st_size)
    key = f"telegram:media:{bot_id}:{path.name}:{digest}"
    file_id = await _get_file_id(key)
    if file_id:
        result = await _try_cached_media(send, file_id)
        if result is not None:
            return result

    async with _upload_locks[path]:
        # Пока ожидали блокировку, другой запрос мог уже загрузить файл.
        current_id = await _get_file_id(key)
        if current_id and current_id != file_id:
            result = await _try_cached_media(send, current_id)
            if result is not None:
                return result

        result = await send(FSInputFile(path))
        if isinstance(result, Message):
            cached_media = result.video
            if result.photo:
                cached_media = max(result.photo, key=lambda photo: photo.width * photo.height)
            if cached_media:
                with suppress(RedisError):
                    await async_redis.set(key, cached_media.file_id, ex=30 * 24 * 60 * 60)
        return result
