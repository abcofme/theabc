from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.types.web_app_info import WebAppInfo
from aiogram.utils.i18n import gettext
from aiogram.utils.keyboard import InlineKeyboardBuilder

from backend.database.models import User
from backend.telegram.callback_data.profile import Profile, Psychologist, TechSupport, MainMenu, Referal
from backend.telegram.callback_data.tests import Tests
from backend.telegram.keyboards.admin.menu import admin_menu_btn
from settings import settings

diary_btn = InlineKeyboardButton(
    text="Личный дневник 📝",
    web_app=WebAppInfo(url=settings.WEB_APP_URL)
)

profile_btn = InlineKeyboardButton(
    text=gettext("buttons.profile"),
    callback_data=Profile().pack()
)

tests_btn = InlineKeyboardButton(
    text=gettext("buttons.tests"),
    callback_data=Tests().pack()
)

main_menu_btn = InlineKeyboardButton(
    text="Главное меню",
    callback_data=MainMenu().pack()
)

psychologist_btn = InlineKeyboardButton(
    text=gettext("buttons.psychologist"),
    callback_data=Psychologist().pack()
)

tech_support_btn = InlineKeyboardButton(
    text="Связь",
    callback_data=TechSupport().pack()
)

referal_btn = InlineKeyboardButton(
    text=gettext("buttons.referal"),
    callback_data=Referal().pack()
)


def start_kb(user: User) -> InlineKeyboardMarkup:
    buttons = [
        [diary_btn],
        [tests_btn],
        [tech_support_btn],
        [referal_btn]
    ]
    if user.admin:
        buttons.append([admin_menu_btn])
    return InlineKeyboardBuilder(buttons).as_markup()

def menu_kb() -> InlineKeyboardMarkup:
    buttons = [
        [main_menu_btn],
    ]
    return InlineKeyboardBuilder(buttons).as_markup()