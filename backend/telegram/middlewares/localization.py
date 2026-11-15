from aiogram.types import TelegramObject
from aiogram.utils.i18n import I18nMiddleware, I18n

from paths import LOCALES


class DatabaseI18nMiddleware(I18nMiddleware):
    async def get_locale(self, event: TelegramObject, data: dict) -> str:
        return "ru"

    def __init__(self):
        i18n = I18n(path=LOCALES, default_locale='ru', domain="messages")

        super().__init__(i18n, middleware_key='i18n')
        I18n.set_current(i18n)
