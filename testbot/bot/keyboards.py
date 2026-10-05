from aiogram.filters.callback_data import CallbackData
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from . import config

CATEGORY_EMOJI = {
    "темперамент": "🔥",
    "общительность": "💬",
    "самооценка": "🪞",
    "личность": "🧩",
    "профориентация": "🧭",
}


class Menu(CallbackData, prefix="m"):
    action: str  # home | catalog | results


class CategoryCb(CallbackData, prefix="c"):
    id: int


class TestCb(CallbackData, prefix="t"):
    id: int


class StartCb(CallbackData, prefix="s"):
    test_id: int
    fresh: bool  # True — начать заново, False — продолжить с сохранённого вопроса


class AnswerCb(CallbackData, prefix="a"):
    test_id: int
    index: int  # номер вопроса: защита от двойных нажатий и старых кнопок
    answer_id: int


class PrevCb(CallbackData, prefix="p"):
    test_id: int


class RetakeCb(CallbackData, prefix="r"):
    test_id: int


def category_emoji(name: str) -> str:
    return CATEGORY_EMOJI.get(name.strip().lower(), "📋")


def main_menu() -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.row(InlineKeyboardButton(text="📚 Тесты", callback_data=Menu(action="catalog").pack()))
    kb.row(InlineKeyboardButton(text="📊 Мои результаты", callback_data=Menu(action="results").pack()))
    kb.row(InlineKeyboardButton(text="📱 Приложение «Азбука Я»", url=config.MAIN_BOT_URL))
    return kb.as_markup()


def catalog(categories: list[dict]) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    for category in categories:
        tests = category["tests"]
        passed = sum(t["passed"] for t in tests)
        lock = " 🔒" if category["locked"] else ""
        text = f"{category_emoji(category['name'])} {category['name']} · {passed}/{len(tests)}{lock}"
        kb.row(InlineKeyboardButton(text=text, callback_data=CategoryCb(id=category["id"]).pack()))
    kb.row(InlineKeyboardButton(text="⬅️ В меню", callback_data=Menu(action="home").pack()))
    return kb.as_markup()


def category(category: dict) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    if category["locked"]:
        kb.row(InlineKeyboardButton(text="🔓 Открыть в приложении «Азбука Я»", url=config.MAIN_BOT_URL))
    else:
        for test in category["tests"]:
            mark = "✅ " if test["passed"] else ""
            kb.row(InlineKeyboardButton(text=mark + test["name"], callback_data=TestCb(id=test["id"]).pack()))
    kb.row(InlineKeyboardButton(text="⬅️ К категориям", callback_data=Menu(action="catalog").pack()))
    return kb.as_markup()


def test_card(test: dict, saved_answers: int) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    if test["result"] is not None:
        kb.row(InlineKeyboardButton(text="🔄 Пройти заново", callback_data=RetakeCb(test_id=test["id"]).pack()))
    elif saved_answers:
        total = len(test["questions"])
        kb.row(InlineKeyboardButton(
            text=f"▶️ Продолжить с вопроса {saved_answers + 1} из {total}",
            callback_data=StartCb(test_id=test["id"], fresh=False).pack(),
        ))
        kb.row(InlineKeyboardButton(text="🔁 Начать заново", callback_data=StartCb(test_id=test["id"], fresh=True).pack()))
    else:
        kb.row(InlineKeyboardButton(text="▶️ Начать тест", callback_data=StartCb(test_id=test["id"], fresh=True).pack()))
    kb.row(InlineKeyboardButton(text="⬅️ К тестам", callback_data=CategoryCb(id=test["category_id"]).pack()))
    return kb.as_markup()


def question(test: dict, index: int) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.row(*[
        InlineKeyboardButton(
            text=answer["name"],
            callback_data=AnswerCb(test_id=test["id"], index=index, answer_id=answer["id"]).pack(),
        )
        for answer in test["questions"][index]["answers"]
    ])
    controls = []
    if index > 0:
        controls.append(InlineKeyboardButton(text="⬅️ Назад", callback_data=PrevCb(test_id=test["id"]).pack()))
    # Ответы сохраняются: тест можно продолжить позже
    controls.append(InlineKeyboardButton(text="⏸ Пауза", callback_data=CategoryCb(id=test["category_id"]).pack()))
    kb.row(*controls)
    return kb.as_markup()


def after_result(test: dict) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.row(InlineKeyboardButton(text="⬅️ К тестам категории", callback_data=CategoryCb(id=test["category_id"]).pack()))
    kb.row(InlineKeyboardButton(text="📚 Все категории", callback_data=Menu(action="catalog").pack()))
    return kb.as_markup()


def results(categories: list[dict]) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    for category in categories:
        for test in category["tests"]:
            if test["passed"]:
                kb.row(InlineKeyboardButton(
                    text=f"{category_emoji(category['name'])} {test['name']}",
                    callback_data=TestCb(id=test["id"]).pack(),
                ))
    kb.row(InlineKeyboardButton(text="⬅️ В меню", callback_data=Menu(action="home").pack()))
    return kb.as_markup()
