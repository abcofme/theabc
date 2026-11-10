from datetime import datetime
from html import escape

from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, FSInputFile
from sqlalchemy import delete, select
from sqlalchemy.orm import joinedload

from backend.database.models import Progress, ProgressLog, Test
from backend.database.patterns.result import ResultDAO
from backend.telegram.bot import dp, bot
from backend.telegram.callback_data.base import SliderPage
from backend.telegram.keyboards.base import back_kb
from backend.telegram.keyboards.slider import slider_kb
from backend.telegram.keyboards.start import psychologist_btn, main_menu_btn
from backend.telegram.keyboards.tests import *
from backend.telegram.states.tests import TestsStates
from backend.telegram.utils.message import (
    edit_scheduled_message, schedule_previous_message, delete_pending_messages, schedule_message_edition,
    delete_editing_message, schedule_message_deletion
)
from backend.telegram.utils.text import split_string
from backend.telegram.views.hardcoded_tests import get_hardcoded_test_result
from backend.progress import lock_user_progress, save_test_progress
from backend.utils.text import question_mark
from paths import IMAGES


def question_text(question: Question, answers: list[Answer], number: int, total: int) -> str:
    prompt = escape(question_mark(question.name), quote=False)
    options = "\n".join(
        f"{i}. {escape(upcase_first_letter(answer.name), quote=False)}"
        for i, answer in enumerate(answers, start=1)
    )
    return (
        f"<i>Вопрос {number} из {total}</i>\n"
        f"<blockquote><b>{prompt}</b></blockquote>\n\n"
        f"<u>Варианты ответа</u>\n{options}"
    )


@dp.callback_query(Tests.filter())
async def Tests_callback(
        callback: CallbackQuery, callback_data: Tests,
        user: User, state: FSMContext, dao: DataAccessObject
):
    await schedule_previous_message(user, callback.message, state)
    await delete_pending_messages(user)
    await edit_scheduled_message(
        user=user,
        text=gettext("message.tests.choose_category"),
        kb=await category_tests_kb(dao=dao, user=user, profile=False)
    )


@dp.callback_query(CategoryChoose.filter())
async def CategoryChoose_callback(
        callback: CallbackQuery, callback_data: CategoryChoose,
        user: User, state: FSMContext, dao: DataAccessObject
):
    await schedule_previous_message(user, callback.message, state)

    category = await dao.get_object(Category, callback_data.category_id)
    if callback_data.profile:
        await state.update_data(dict(is_profile=True))
        text = (
            f"<b>{escape(category.name.capitalize(), quote=False)}</b>\n\n"
            "<i>Выберите результат теста из списка.</i>\n\n"
        )
    else:
        await state.update_data(dict(is_profile=False))
        text = f"{category.description}\n\n" + gettext("messages.test.choose_test")

    await state.set_state(TestsStates.slider)
    await state.update_data(
        dict(category_id=callback_data.category_id)
    )
    conditions = dict(category_id=callback_data.category_id)
    tests = await dao.filter(Test, conditions)
    try:
        tests = sorted(tests, key=lambda x: (x.order_number is None, x.order_number))
    except:
        pass
    for i, test in enumerate(tests, start=1):
        text += f"{i}. {escape(test.name, quote=False)}\n"
    kb = await slider_kb(
        db_model=Test, callback_data=TestChoose, dao=dao,
        part=4, conditions=dict(category_id=callback_data.category_id)
    )

    await delete_editing_message(user)
    if category.name.lower() in [
        "личность", "общительность", "профориентация", "самооценка", "темперамент"
    ]:
        msg = await bot.send_photo(
            chat_id=user.id,
            photo=FSInputFile(IMAGES / f"{category.name.lower()}.jpg"),
            caption=text,
            reply_markup=kb
        )
    else:
        msg = await bot.send_message(
            chat_id=user.id,
            text=text,
            reply_markup=kb
        )
    await schedule_message_edition(user, msg)


@dp.callback_query(TestChoose.filter())
async def TestChoose_callback(
        callback: CallbackQuery, callback_data: TestChoose,
        user: User, state: FSMContext, dao: DataAccessObject
):
    await schedule_previous_message(user, callback.message, state)

    data = await state.get_data()
    if data.get("is_profile"):
        progresses = await dao.filter(
            Progress, dict(user_id=user.id, test_id=callback_data.id),
            options=[joinedload(Progress.test)]
        )
        text = "<b>Вы ещё не проходили этот тест</b>"
        kb = back_kb()
        for progress in progresses:
            if progress.hardcode_value:
                text = f"<b>{escape(progress.test.name, quote=False)}</b>\n\n{progress.hardcode_value}"
            else:
                result = await ResultDAO(dao).get_by_points(progress.test_id, progress.value)
                result_text = upcase_first_letter(result.name) if result else ""
                test_name = upcase_first_letter(progress.test.name) if progress.test else ""
                text = f"<b>{escape(test_name, quote=False)}</b>\n\n{result_text}"
    else:
        test = await dao.get_object(Test, callback_data.id, options=[joinedload(Test.questions)])
        text = f"<b>{escape(test.name, quote=False)}</b>\n\n{test.description or ''}"
        kb = test_accept_choose_kb(test.id)

    if len(text) < 1024:
        await edit_scheduled_message(
            user=user,
            text=text,
            kb=kb
        )
    else:
        await delete_editing_message(user)
        texts = split_string(text)
        for i, msg_text in enumerate(texts, start=1):
            if i == len(texts):
                msg = await bot.send_message(
                    chat_id=user.id,
                    text=msg_text,
                    reply_markup=kb
                )
                await schedule_message_deletion(user, msg)
            else:
                msg = await bot.send_message(
                    chat_id=user.id,
                    text=msg_text
                )
                await schedule_message_deletion(user, msg)
    # await edit_scheduled_message(
    #     user=user,
    #     text=text,
    #     kb=kb
    # )


@dp.callback_query(TestAcceptChoose.filter())
async def TestAcceptChoose_callback(
        callback: CallbackQuery, callback_data: TestAcceptChoose,
        user: User, state: FSMContext, dao: DataAccessObject
):
    await schedule_previous_message(user, callback.message, state)

    test = await dao.get_object(Test, callback_data.id, options=[joinedload(Test.questions)])
    test.questions: list[Question]
    question = test.questions[0]

    answers = await dao.filter(Answer, dict(question_id=question.id))
    text = question_text(question, answers, 1, len(test.questions))

    await state.update_data(
        dict(
            test_id=test.id, index_question=0, answer_ids=[], test_started_at=datetime.utcnow().isoformat()
        )
    )

    await edit_scheduled_message(
        user=user,
        text=text,
        kb=await question_kb(dao, question, first_question=True)
    )


@dp.callback_query(BackQuestion.filter())
async def BackQuestion_callback(
        callback: CallbackQuery, callback_data: BackQuestion,
        user: User, state: FSMContext, dao: DataAccessObject
):
    data = await state.get_data()

    test = await dao.get_object(Test, data.get("test_id"), options=[joinedload(Test.questions)])
    test.questions: list[Question]
    new_index = data.get("index_question") - 1
    question = test.questions[new_index]
    answer_ids: list[int] = data.get("answer_ids")
    answer_ids.pop(-1)

    await state.update_data(dict(index_question=new_index, answer_ids=answer_ids))

    answers = await dao.filter(Answer, dict(question_id=question.id))
    text = question_text(question, answers, new_index + 1, len(test.questions))

    await edit_scheduled_message(
        user=user,
        text=text,
        kb=await question_kb(dao, question, first_question=not new_index)
    )


@dp.callback_query(AnswerChoose.filter())
async def AnswerChoose_callback(
        callback: CallbackQuery, callback_data: AnswerChoose,
        user: User, state: FSMContext, dao: DataAccessObject
):
    data = await state.get_data()
    answer_ids: list[int] = data.get("answer_ids")
    answer_ids.append(callback_data.answer_id)

    test = await dao.get_object(Test, data.get("test_id"), options=[joinedload(Test.questions)])
    test.questions: list[Question]

    if len(test.questions) - 1 == data.get("index_question"):
        answers = await dao.get_objects_by_ids(Answer, answer_ids)
        if {answer.question_id for answer in answers} != {question.id for question in test.questions}:
            return await callback.answer(text=gettext("messages.tests.result_does_not_exist"))

        if test.hardcode_test:
            result = get_hardcoded_test_result(answers, test)
            progress = Progress(
                test_id=data.get("test_id"),  # NOQA
                user_id=user.id,  # NOQA
                value=0,  # NOQA
                hardcode_value=result  # NOQA
            )
        else:
            points = 0
            for answer in answers:
                points += answer.value
            result_obj = await ResultDAO(dao).get_by_points(data.get("test_id"), points)
            progress = Progress(
                test_id=data.get("test_id"),  # NOQA
                user_id=user.id,  # NOQA
                value=points  # NOQA
            )
            result = upcase_first_letter(result_obj.name) if result_obj else ""
        async with dao.session.begin():
            await lock_user_progress(dao.session, user.id)
            started_at = data.get("test_started_at")
            already_completed = started_at and await dao.session.scalar(select(ProgressLog.id).where(
                ProgressLog.test_id == test.id,
                ProgressLog.user_id == user.id,
                ProgressLog.created_at >= datetime.fromisoformat(started_at),
            ).limit(1)) is not None
            if not already_completed:
                await dao.session.execute(delete(Progress).where(Progress.test_id == test.id, Progress.user_id == user.id))
                save_test_progress(dao.session, progress)
        if already_completed:
            return await callback.answer()
        if result:
            text = gettext("messages.tests.result").format(
                result=result
            )
            kb = InlineKeyboardBuilder([
                [back_btn()], [psychologist_btn], [main_menu_btn]
            ]).as_markup()
        else:
            return await callback.answer(
                text=gettext("messages.tests.result_does_not_exist")
            )
    else:
        new_index = data.get("index_question") + 1
        question = test.questions[new_index]
        await state.update_data(dict(answer_ids=answer_ids, index_question=new_index))
        answers = await dao.filter(Answer, dict(question_id=question.id))
        text = question_text(question, answers, new_index + 1, len(test.questions))
        kb = await question_kb(dao, question)

    if len(text) < 1024:
        await edit_scheduled_message(
            user=user,
            text=text,
            kb=kb
        )
    else:
        await delete_editing_message(user)
        msg = await bot.send_message(
            chat_id=user.id,
            text=text,
            reply_markup=kb
        )
        await schedule_message_edition(user, msg)


@dp.callback_query(FreeTests.filter())
async def FreeTests_callback(
        callback: CallbackQuery, callback_data: FreeTests,
        user: User, state: FSMContext, dao: DataAccessObject
):
    await schedule_previous_message(user, callback.message, state)
    await state.set_state(TestsStates.slider)
    await state.update_data(
        dict(category_id=callback_data.category_id, free=True)
    )
    conditions = dict(category_id=callback_data.category_id, free=True)
    tests = await dao.filter(Test, conditions)
    category = await dao.get_object(Category, callback_data.category_id)
    if tests:
        text = f"{category.description}\n\n" + gettext("messages.test.choose_test")
        for i, test in enumerate(tests, start=1):
            text += f"{i}. {escape(test.name, quote=False)}\n"
    else:
        text = f"{category.description}\n\n" + gettext("messages.test.choose_test.no_free_tests")
    kb = await slider_kb(
        db_model=Test, callback_data=TestChoose, dao=dao,
        part=4, conditions=conditions
    )
    await edit_scheduled_message(
        user=user,
        text=text,
        kb=kb
    )


@dp.callback_query(StateFilter(TestsStates.slider), SliderPage.filter())
async def TestsStates_SliderPage_callback(
        callback: CallbackQuery, callback_data: SliderPage,
        user: User, dao: DataAccessObject, state: FSMContext
):
    data = await state.get_data()
    conditions = dict()
    conditions["category_id"] = data.get("category_id")
    if data.get("free"):
        conditions["free"] = data.get("free")
    kb = await slider_kb(
        db_model=Test, callback_data=TestChoose, dao=dao,
        part=4, page=callback_data.page,
        conditions=conditions,
    )

    await edit_scheduled_message(user, kb=kb)

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
            text += f"{i}. {escape(test.name, quote=False)}\n"
        kb = await slider_kb(
            db_model=Test, callback_data=TestChoose, dao=dao,
            part=4, conditions=conditions
        )
        await edit_scheduled_message(
            user=user,
            text=text,
            kb=kb
        )

