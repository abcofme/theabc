from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.utils.i18n import gettext
from aiogram.utils.keyboard import InlineKeyboardBuilder

from backend.database.models import Category, User, Payment, Question, Answer
from backend.database.patterns.dao import DataAccessObject
from backend.telegram.callback_data.tests import *
from backend.telegram.keyboards.base import back_btn
from backend.utils.text import upcase_first_letter

tests_btn = InlineKeyboardButton(
    text=gettext("buttons.tests"),
    callback_data=Tests().pack()
)


back_question_btn = InlineKeyboardButton(
    text=gettext("buttons.previous_question"),
    callback_data=BackQuestion().pack()
)


async def category_tests_kb(dao: DataAccessObject, user: User, profile: bool, is_profile: bool = False) -> InlineKeyboardMarkup:
    categories = await dao.get_all(Category)
    categories = sorted(categories, key=lambda c: 1 if c.name.lower() == "профориентация" else 0)
    payments = await dao.filter(Payment, dict(user_id=user.id, success=True))
    payment_categories_ids = [payment.category_id for payment in payments]
    buttons = list()
    flag = False
    for category in categories:
        if category.id not in payment_categories_ids:
            flag = True
        buttons.append(
            [
                InlineKeyboardButton(
                    text=category.name,
                    callback_data=CategoryChoose(category_id=category.id, profile=profile).pack()
                )
            ]
        )

    buttons.append([back_btn()])
    return InlineKeyboardBuilder(buttons).as_markup()


async def type_tests_kb(category: Category, user: User, dao: DataAccessObject) -> InlineKeyboardMarkup:
    payments = await dao.filter(
        Payment, dict(user_id=user.id, category_id=category.id, success=True)
    )
    buttons = [
        [
            InlineKeyboardButton(
                text=gettext("buttons.free_tests"),
                callback_data=FreeTests(category_id=category.id).pack()
            )
        ]
    ]
    if payments:
        buttons.append([
            InlineKeyboardButton(
                text=gettext("buttons.full_tests.opened"),
                callback_data=FullTests(
                    category_id=category.id, opened=True
                ).pack()
            )
        ])
    buttons.append([back_btn()])
    return InlineKeyboardBuilder(buttons).as_markup()




def test_accept_choose_kb(test_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardBuilder([
        [
            InlineKeyboardButton(
                text="Пройти тест",
                callback_data=TestAcceptChoose(id=test_id).pack()
            )
        ],
        [
            back_btn()
        ]
    ]).as_markup()


async def question_kb(
        dao: DataAccessObject, question: Question, first_question: bool = False
) -> InlineKeyboardMarkup:
    buttons = list()
    answers = await dao.filter(Answer, dict(question_id=question.id))
    for i, answer in enumerate(answers):
        buttons.append(
            [
                InlineKeyboardButton(
                    text=upcase_first_letter(answer.name),
                    callback_data=AnswerChoose(answer_id=answer.id).pack()
                )
            ]
        )
    if first_question:
        buttons.append([back_btn()])
    else:
        buttons.append([back_question_btn])
    return InlineKeyboardBuilder(buttons).as_markup()
