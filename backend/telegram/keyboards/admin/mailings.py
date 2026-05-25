from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.utils.i18n import gettext
from aiogram.utils.keyboard import InlineKeyboardBuilder

from backend.telegram.callback_data.admin import *


def admin_accept_mailings_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardBuilder(
        [
            [
                InlineKeyboardButton(
                    text=gettext("buttons.admin.mailings.accept"),
                    callback_data=AdminAcceptCreateMailing().pack()
                ),
            ]
        ]
    ).as_markup()
