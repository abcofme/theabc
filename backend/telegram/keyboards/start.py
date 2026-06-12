from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.types.web_app_info import WebAppInfo
from aiogram.utils.i18n import gettext
from aiogram.utils.keyboard import InlineKeyboardBuilder

from backend.database.models import User
from backend.telegram.callback_data.profile import AboutDiary, AboutTests, TestCategoryDesc, TechSupport, MainMenu, Psychologist
from backend.telegram.keyboards.admin.menu import admin_menu_btn
from settings import settings

diary_btn = InlineKeyboardButton(
    text="Личный дневник",
    web_app=WebAppInfo(url=settings.WEB_APP_URL)
)

about_diary_btn = InlineKeyboardButton(
    text="О дневнике",
    callback_data=AboutDiary().pack()
)

about_tests_btn = InlineKeyboardButton(
    text="О тестах",
    callback_data=AboutTests().pack()
)

tech_support_btn = InlineKeyboardButton(
    text="Связь",
    callback_data=TechSupport().pack()
)

psychologist_btn = InlineKeyboardButton(
    text=gettext("buttons.psychologist"),
    callback_data=Psychologist().pack()
)

main_menu_btn = InlineKeyboardButton(
    text="Назад",
    callback_data=MainMenu().pack()
)


def start_kb(user: User) -> InlineKeyboardMarkup:
    buttons = [
        [diary_btn],
        [about_diary_btn],
        [about_tests_btn],
        [tech_support_btn]
    ]
    if user.admin:
        buttons.append([admin_menu_btn])
    return InlineKeyboardBuilder(buttons).as_markup()

def menu_kb() -> InlineKeyboardMarkup:
    buttons = [
        [main_menu_btn],
    ]
    return InlineKeyboardBuilder(buttons).as_markup()

def categories_kb() -> InlineKeyboardMarkup:
    categories = ["Личность", "Самооценка", "Темперамент", "Общительность", "Профориентация"]
    builder = InlineKeyboardBuilder()
    for cat in categories:
        builder.button(text=cat, callback_data=TestCategoryDesc(name=cat).pack())
    builder.adjust(1)
    builder.row(main_menu_btn)
    return builder.as_markup()