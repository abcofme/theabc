from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.types.web_app_info import WebAppInfo
from aiogram.utils.i18n import gettext
from aiogram.utils.keyboard import InlineKeyboardBuilder

from backend.telegram.callback_data.profile import (
    AboutDiary, AboutProject, AboutTests, ContactTopic, ContactTopicChoice, MainMenu, Psychologist, TechSupport,
    TestCategoryDesc,
)
from settings import settings

diary_btn = InlineKeyboardButton(
    text="Личный дневник",
    web_app=WebAppInfo(url=settings.WEB_APP_URL),
    style="primary",
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

about_project_btn = InlineKeyboardButton(
    text="Как это выглядит изнутри",
    callback_data=AboutProject().pack()
)

psychologist_btn = InlineKeyboardButton(
    text=gettext("buttons.psychologist"),
    callback_data=Psychologist().pack()
)

main_menu_btn = InlineKeyboardButton(
    text="← Назад",
    callback_data=MainMenu().pack()
)


def start_kb(*, has_details_video: bool = False) -> InlineKeyboardMarkup:
    buttons = [[diary_btn]]
    if has_details_video:
        buttons.append([about_project_btn])
    buttons.extend([
        [about_diary_btn],
        [about_tests_btn],
        [tech_support_btn],
    ])
    return InlineKeyboardBuilder(buttons).as_markup()

def menu_kb() -> InlineKeyboardMarkup:
    buttons = [
        [main_menu_btn],
    ]
    return InlineKeyboardBuilder(buttons).as_markup()


def contact_topics() -> tuple[str, ...]:
    return tuple(settings.CONTACT_DESTINATIONS) or tuple(topic.value for topic in ContactTopic)


def contact_topics_kb() -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    for label in contact_topics():
        builder.button(text=label, callback_data=ContactTopicChoice.for_label(label))
    builder.adjust(1)
    builder.row(main_menu_btn)
    return builder.as_markup()


def contact_back_kb(text: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=text, callback_data=TechSupport().pack())],
        [InlineKeyboardButton(text="← В меню", callback_data=MainMenu().pack())],
    ])


def about_diary_kb() -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.row(InlineKeyboardButton(
        text="Открыть личный дневник",
        web_app=WebAppInfo(url=settings.WEB_APP_URL)
    ))
    builder.row(main_menu_btn)
    return builder.as_markup()

def categories_kb() -> InlineKeyboardMarkup:
    categories = ("Личность", "Самооценка", "Темперамент", "Общительность", "Профориентация")
    builder = InlineKeyboardBuilder()
    
    builder.row(InlineKeyboardButton(
        text="Открыть тесты",
        web_app=WebAppInfo(url=settings.WEB_APP_URL + "?tab=tests")
    ))
    
    for category in categories:
        builder.row(InlineKeyboardButton(text=category, callback_data=TestCategoryDesc(name=category).pack()))
    
    builder.row(main_menu_btn)
    return builder.as_markup()
