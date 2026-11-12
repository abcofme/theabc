import html

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from loguru import logger

from backend.database.models import User
from backend.telegram.bot import bot
from settings import settings


async def notify(user_id: int, text: str, query: str = "", button: str = "Открыть") -> bool:
    """Сообщение от бота с кнопкой, которая открывает нужный экран приложения (query — параметры ссылки,
    например tab=reports&report=12). Ошибка отправки — например, бот заблокирован — не мешает основному действию"""
    if user_id <= 0:
        return False  # У отдельного браузерного профиля нет чата Telegram.
    url = settings.WEB_APP_URL + (f"?{query}" if query else "")
    markup = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text=button, web_app=WebAppInfo(url=url))]])
    try:
        await bot.send_message(chat_id=user_id, text=text, reply_markup=markup)
        return True
    except Exception as e:
        logger.warning(f"Notify {user_id} failed: {e!r}")
        return False


async def greet_new_friend(friend: User, inviter_id: int) -> bool:
    """Пригласившему — что друг принял приглашение (из бота и из приложения)"""
    name = html.escape(friend.tg_first_name or (f"@{friend.username}" if friend.username else "Человек, принявший твоё приглашение"))
    return await notify(
        inviter_id,
        "<b>Приглашение принято</b>\n\n"
        f"<b>{name}</b> теперь у тебя в друзьях в «Азбуке Я».\n\n"
        "<i>Можешь посмотреть вашу совместимость.</i>",
        "tab=reports&section=compatibility", "Открыть совместимость",
    )
