import re
import sys

from aiogram.client.default import Default
from aiogram.client.session.middlewares.base import BaseRequestMiddleware, NextRequestMiddlewareType
from aiogram.exceptions import TelegramBadRequest
from aiogram.methods import TelegramMethod
from aiogram.methods.base import TelegramType, Response
from loguru import logger

# Кастомные эмодзи из своего набора: обычный эмодзи в тексте → id кастомного.
# Бот сам подменяет их во всех сообщениях и подписях — тексты пишутся с обычными эмодзи.
# Работает, только если у аккаунта, создавшего бота, есть Telegram Premium.
# id всего набора: python -m backend.telegram.emoji https://t.me/addemoji/<имя набора>
CUSTOM_EMOJI: dict[str, str] = {
    # "🌳": "5368324170671202286",
}

# Готовые теги <tg-emoji> не трогаем — их можно вставлять в текст и вручную
_TAG = re.compile(r"(<tg-emoji\b[^>]*>.*?</tg-emoji>)", re.S)


def with_custom_emoji(text: str) -> str:
    if not CUSTOM_EMOJI or not text:
        return text
    # Длинные ключи первыми, чтобы «❤️» не разбивался на «❤» и вариант-селектор
    pattern = re.compile("|".join(re.escape(e) for e in sorted(CUSTOM_EMOJI, key=len, reverse=True)))
    parts = _TAG.split(text)
    for i in range(0, len(parts), 2):
        parts[i] = pattern.sub(lambda m: f'<tg-emoji emoji-id="{CUSTOM_EMOJI[m[0]]}">{m[0]}</tg-emoji>', parts[i])
    return "".join(parts)


class CustomEmojiMiddleware(BaseRequestMiddleware):
    """Подставляет кастомные эмодзи в text и caption HTML-сообщений перед отправкой"""

    async def __call__(
            self, make_request: NextRequestMiddlewareType[TelegramType],
            bot, method: TelegramMethod[TelegramType]
    ) -> Response[TelegramType]:
        parse_mode = getattr(method, "parse_mode", None)
        if isinstance(parse_mode, Default):
            parse_mode = bot.default[parse_mode.name]
        if parse_mode != "HTML" or getattr(method, "entities", None) or getattr(method, "caption_entities", None):
            return await make_request(bot, method)

        update = {}
        for field in ("text", "caption"):
            value = getattr(method, field, None)
            if isinstance(value, str) and (replaced := with_custom_emoji(value)) != value:
                update[field] = replaced
        if not update:
            return await make_request(bot, method)
        try:
            return await make_request(bot, method.model_copy(update=update))
        except TelegramBadRequest as e:
            # Например, у владельца бота кончился Premium — отправляем с обычными эмодзи
            logger.warning(f"Custom emoji rejected, sending plain: {e.message}")
            return await make_request(bot, method)


async def print_pack(name: str):
    from backend.telegram.bot import bot

    pack = await bot.get_sticker_set(name=name.rstrip("/").rsplit("/", 1)[-1])
    print(f"# {pack.title}")
    for sticker in pack.stickers:
        if sticker.custom_emoji_id:
            print(f'    "{sticker.emoji}": "{sticker.custom_emoji_id}",')
    await bot.session.close()


if __name__ == "__main__":
    import asyncio

    if len(sys.argv) != 2:
        sys.exit("Usage: python -m backend.telegram.emoji https://t.me/addemoji/<pack>")
    asyncio.run(print_pack(sys.argv[1]))
