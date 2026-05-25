import asyncio
from typing import Any, Dict, Union

from aiogram import BaseMiddleware
from aiogram.types import Message, Update


class AlbumMiddleware(BaseMiddleware):
    def __init__(self, latency: Union[int, float] = 1.5):
        self.latency = latency
        self.album_data = {}

    def collect_album_messages(self, message: Message):
        album_id = message.media_group_id
        if album_id not in self.album_data:
            self.album_data[album_id] = {
                "messages": [],
                "expected_photos": int(message.media_group_id),  # Записываем количество фотографий
            }
        self.album_data[album_id]["messages"].append(message)
        self.album_data[album_id]["expected_photos"] -= 1  # хуита
        return len(self.album_data[album_id]["messages"])

    async def __call__(self, handler, event: Update, data: Dict[str, Any]) -> Any:
        if event.message:
            message = event.message
        elif event.callback_query:
            message = event.callback_query.message
        else:
            return await handler(event, data)
        if message.chat.type != 'private':
            return
        if not message.media_group_id:
            return await handler(event, data)
        total_before = self.collect_album_messages(message)
        await asyncio.sleep(self.latency)
        total_after = len(self.album_data[message.media_group_id]["messages"])
        if total_before != total_after:
            album_id = message.media_group_id
            album_data = self.album_data[album_id]
            album_messages = album_data["messages"]
            album_messages.sort(key=lambda x: x.date)
            data["album"] = album_messages
            if album_data["expected_photos"] == 0:
                del self.album_data[album_id]
        return await handler(event, data)
