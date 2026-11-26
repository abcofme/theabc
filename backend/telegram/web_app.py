from aiogram import Bot
from aiogram.types import MenuButtonWebApp, WebAppInfo

from settings import settings


async def configure_web_app_menu(bot: Bot) -> None:
    # Без отдельного URL сохраняем существующую настройку меню бота.
    if settings.TELEGRAM_WEB_APP_URL:
        await bot.set_chat_menu_button(menu_button=MenuButtonWebApp(
            text="Открыть дневник",
            web_app=WebAppInfo(url=settings.telegram_web_app_url),
        ))
