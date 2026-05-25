from aiogram.filters import BaseFilter
from aiogram.types import Message, CallbackQuery, TelegramObject

from backend.database.models import User
from backend.database.patterns.dao import DataAccessObject
from backend.telegram.utils.message import delete_pending_messages


class AdminMessageFilter(BaseFilter):
    async def __call__(
            self, message: Message, user: User, dao: DataAccessObject
    ) -> bool:
        if user.admin:
            return True
        else:
            await message.delete()
            return False


class AdminCallbackFilter(BaseFilter):
    async def __call__(
            self, callback: CallbackQuery, user: User, dao: DataAccessObject
    ) -> bool:
        if user.admin:
            return True
        else:
            await callback.message.delete()
            return False


class AdminFilter(BaseFilter):
    async def __call__(
            self, telegram_object: TelegramObject, user: User,
            *args, **kwargs
    ) -> bool:
        message = telegram_object
        if isinstance(telegram_object, Message):
            message = telegram_object
        if isinstance(telegram_object, CallbackQuery):
            message = telegram_object.message
        if user.admin:
            return True
        else:
            await message.delete()
            await delete_pending_messages(user)
            return False
