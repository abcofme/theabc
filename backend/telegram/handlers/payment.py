from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from decimal import Decimal

from backend.database.models import Test
from backend.telegram.bot import dp, bot
from backend.telegram.keyboards.slider import slider_kb
from backend.telegram.keyboards.start import menu_kb
from backend.telegram.keyboards.tests import *
from backend.telegram.states.tests import TestsStates, BuyTestsStates
from backend.telegram.utils.message import (
    edit_scheduled_message, schedule_previous_message
)
from backend.telegram.views.payment import check_payment, create_payment, calculate_discount, set_payment
from backend.utils.email import is_valid_email


@dp.callback_query(BuyAllTests.filter())
async def BuyAllTests_callback(
        callback: CallbackQuery, callback_data: BuyAllTests,
        user: User, state: FSMContext, dao: DataAccessObject
):
    await callback.answer()
    amount = calculate_discount(amount=999, user=user)
    if amount == Decimal(0):
        categories = await dao.get_all(Category)
        await set_payment(user=user, dao=dao, category_ids=[category.id for category in categories])
        await state.clear()
        await callback.message.answer(
            text=gettext("message.payment.correct").format(
                name=user.tg_first_name,
            ),
            reply_markup=menu_kb()
        )
        await callback.message.delete()
        return
    await state.set_state(BuyTestsStates.email)  # name
    await state.update_data(dict(payment_type="all_tests"))
    await edit_scheduled_message(
        user=user,
        text="Введите ваш email для отправки чека:",  # "Введите ваш ФИО для отправки чека:"
        kb=None,
    )


@dp.message(StateFilter(BuyTestsStates.name))
async def BuyTestsStates_name_handler(
        message: Message,
        user: User, state: FSMContext, dao: DataAccessObject
):
    fsm_data = await state.get_data()
    fsm_data["name"] = message.text
    await state.update_data(fsm_data)
    await state.set_state(BuyTestsStates.email)

    await message.delete()

    await edit_scheduled_message(
        user=user,
        text="Введите ваш email для отправки чека:",
        kb=None
    )


@dp.message(StateFilter(BuyTestsStates.email))
async def BuyTestsStates_email_handler(
        message: Message,
        user: User, state: FSMContext, dao: DataAccessObject
):
    email = message.text
    await message.delete()

    if not is_valid_email(email):
        return await edit_scheduled_message(
            user=user,
            text="Некорректный email для отправки чека, попробуйте ещё раз:",
            kb=None
        )

    fsm_data = await state.get_data()
    await state.clear()

    match fsm_data.get("payment_type"):
        case "all_tests":
            categories = await dao.get_all(Category)
            amount = calculate_discount(amount=999, user=user)
            payment_url, payment_id = await create_payment(
                user=user, dao=dao, amount=amount,
                description=gettext("message.payment_description.buy_all_tests"),
                category_ids=[category.id for category in categories],
                email=email
            )
            await edit_scheduled_message(
                user=user,
                text=gettext("message.tests.payment").format(url=payment_url),
                kb=check_payment_kb(payment_id)
            )
        case "current_test":
            category = await dao.get_object(Category, fsm_data.get("category_id"))
            amount = calculate_discount(amount=category.price, user=user)
            payment_url, payment_id = await create_payment(
                user=user, dao=dao, amount=amount,
                description=gettext("message.payment_description.buy_current_test").format(
                    name=category.name
                ),
                category_ids=[category.id],
                email=email
            )
            await edit_scheduled_message(
                user=user,
                text=gettext("message.tests.payment").format(url=payment_url),
                kb=check_payment_kb(payment_id)
            )


@dp.callback_query(FullTests.filter())
async def FullTests_callback(
        callback: CallbackQuery, callback_data: FullTests,
        user: User, state: FSMContext, dao: DataAccessObject
):
    await schedule_previous_message(user, callback.message, state)
    category = await dao.get_object(Category, callback_data.category_id)
    if callback_data.opened:
        await state.set_state(TestsStates.slider)
        await state.update_data(
            dict(category_id=callback_data.category_id, free=False)
        )
        conditions = dict(category_id=callback_data.category_id, free=False)
        tests = await dao.filter(Test, conditions)
        text = f"{category.description}\n\n" + gettext("messages.test.choose_test")
        for i, test in enumerate(tests, start=1):
            text += f"{i}. {test.name}\n"
        kb = await slider_kb(
            db_model=Test, callback_data=TestChoose, dao=dao,
            part=4, conditions=conditions
        )
    else:
        amount = calculate_discount(amount=category.price, user=user)
        if amount == Decimal(0):
            await set_payment(user=user, dao=dao, category_ids=[category.id])
            await callback.message.answer(
                text=gettext("message.payment.correct").format(
                    name=user.tg_first_name,
                ),
                reply_markup=menu_kb()
            )
            await callback.message.delete()
            return
        await state.set_state(BuyTestsStates.email)  # name
        await state.update_data(dict(payment_type="current_test", category_id=category.id))
        text = "Введите ваш email для отправки чека:"
        kb = None

    await edit_scheduled_message(
        user=user,
        text=text,
        kb=kb
    )


@dp.callback_query(PaymentCallback.filter())
async def PaymentCallback_callback(
        callback: CallbackQuery, callback_data: PaymentCallback,
        user: User, state: FSMContext, dao: DataAccessObject
):
    check = await check_payment(user, dao, callback_data.payment_id)
    if check:
        try:
            invited_id = int(user.invited_id)
        except:
            invited_id = None

        if invited_id:
            invite_user = await dao.get_object(User, invited_id)
            if invite_user:
                invite_pct = invite_user.discount_pct or 0
                if invite_pct < 100:
                    await dao.update_object(User, invite_user.id, dict(
                        discount_pct=invite_pct + 10
                    ))
                    await bot.send_message(
                        chat_id=invited_id,
                        text=f"Ваша новая скидка: {invite_pct + 10}%"
                    )
                before_pct = user.discount_pct or 0
                await dao.update_object(User, user.id, dict(
                    discount_pct=before_pct + 10
                ))
                await bot.send_message(
                    chat_id=user.id,
                    text=f"Ваша новая скидка: {before_pct + 10}%"
                )

        await callback.message.delete()
        await callback.message.answer(
            text=gettext("message.payment.correct").format(
                name=user.tg_first_name,
            ),
            reply_markup=menu_kb()
        )
    else:
        await callback.answer(
            show_alert=True,
            text=gettext("message.payment.not_correct")
        )
