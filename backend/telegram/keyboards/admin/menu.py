from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.utils.i18n import gettext
from aiogram.utils.keyboard import InlineKeyboardBuilder

from backend.telegram.callback_data.admin import AdminMenu, AdminCreateMailing
from backend.telegram.keyboards.base import back_btn

admin_menu_btn = InlineKeyboardButton(
    text=gettext("buttons.admin.menu"),
    callback_data=AdminMenu().pack()
)

admin_create_mailing_btn = InlineKeyboardButton(
    text=gettext("buttons.admin.mailings.create"),
    callback_data=AdminCreateMailing().pack()
)


def admin_menu_kb() -> InlineKeyboardMarkup:
    buttons = list()
    buttons.append(
        [
            admin_create_mailing_btn
        ]
    )
    buttons.append(
        [
            back_btn()
        ]
    )
    return InlineKeyboardBuilder(buttons).as_markup()
