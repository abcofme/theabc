from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.types import ReplyKeyboardRemove
from aiogram.utils.i18n import gettext
from aiogram.utils.keyboard import InlineKeyboardBuilder

from backend.telegram.callback_data.base import Back

remove_kb: ReplyKeyboardRemove = ReplyKeyboardRemove()


def back_btn(delete: bool = False) -> InlineKeyboardButton:
    return InlineKeyboardButton(
        text=gettext("buttons.back"), callback_data=Back(delete=delete).pack()
    )


def back_kb(delete: bool = False) -> InlineKeyboardMarkup:
    return InlineKeyboardBuilder(
        [
            [
                back_btn(delete=delete),
            ]
        ]
    ).as_markup()
