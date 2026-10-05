import logging
from html import escape

from aiogram import Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command, CommandStart, ExceptionTypeFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, ErrorEvent, InlineKeyboardMarkup, Message, User

from . import keyboards as kb
from .backend import Backend, BackendError

router = Router()
log = logging.getLogger(__name__)

WELCOME = (
    "Привет! Это бот с психологическими тестами <b>«Азбука Я»</b>.\n\n"
    "Здесь те же категории и тесты, что в приложении, и результаты общие: "
    "тест, пройденный в боте, засчитается и в приложении."
)


# --- Незавершённые тесты: ответы по каждому тесту хранятся в FSM (Redis) ---

async def saved_answers(state: FSMContext, test_id: int) -> list[int]:
    return list((await state.get_data()).get("answers", {}).get(str(test_id), []))


async def save_answers(state: FSMContext, test_id: int, answers: list[int] | None):
    all_answers = dict((await state.get_data()).get("answers", {}))
    if answers is None:
        all_answers.pop(str(test_id), None)
    else:
        all_answers[str(test_id)] = answers
    await state.update_data(answers=all_answers)


# --- Отрисовка ---

async def show(callback: CallbackQuery, text: str, markup: InlineKeyboardMarkup):
    try:
        await callback.message.edit_text(text, reply_markup=markup, disable_web_page_preview=True)
    except TelegramBadRequest as e:
        if "message is not modified" not in str(e):
            # Старое сообщение нельзя отредактировать — присылаем новое
            await callback.message.answer(text, reply_markup=markup, disable_web_page_preview=True)
    await callback.answer()


def catalog_text() -> str:
    return "📚 <b>Тесты</b>\n\nВыберите категорию. Рядом — сколько тестов уже пройдено."


def category_text(category: dict) -> str:
    text = f"{kb.category_emoji(category['name'])} <b>{escape(category['name'])}</b>\n\n{escape(category['description'])}"
    if category["locked"]:
        text += (
            "\n\n🔒 Тесты по профориентации открываются после покупки блока "
            "в приложении «Азбука Я» (доступно с Premium)."
        )
    else:
        text += "\n\nВыберите тест:"
    return text


def test_card_text(test: dict, saved: int) -> str:
    text = f"<b>{escape(test['name'])}</b>"
    if test["description"]:
        text += f"\n\n{escape(test['description'])}"
    if test["result"] is not None:
        text += f"\n\n📊 <b>Ваш результат:</b>\n{escape(test['result'])}"
    else:
        text += f"\n\nВопросов: {len(test['questions'])}. Отвечайте честно — правильных ответов нет."
        if saved:
            text += f"\n\nВы остановились на вопросе {saved + 1}."
    return text


def question_text(test: dict, index: int) -> str:
    total = len(test["questions"])
    return (
        f"<b>{escape(test['name'])}</b>\n"
        f"Вопрос {index + 1} из {total}\n\n"
        f"{escape(test['questions'][index]['name'])}"
    )


async def show_question(callback: CallbackQuery, test: dict, index: int):
    await show(callback, question_text(test, index), kb.question(test, index))


async def find_category(backend: Backend, user_id: int, category_id: int) -> dict | None:
    return next((c for c in await backend.catalog(user_id) if c["id"] == category_id), None)


# --- Команды ---

@router.message(CommandStart())
async def cmd_start(message: Message, backend: Backend):
    await backend.upsert_user(message.from_user)
    await message.answer(WELCOME, reply_markup=kb.main_menu())


@router.message(Command("tests"))
async def cmd_tests(message: Message, backend: Backend):
    await message.answer(catalog_text(), reply_markup=kb.catalog(await backend.catalog(message.from_user.id)))


@router.message(Command("results"))
async def cmd_results(message: Message, backend: Backend):
    categories = await backend.catalog(message.from_user.id)
    await message.answer(results_text(categories), reply_markup=kb.results(categories))


def results_text(categories: list[dict]) -> str:
    passed = sum(t["passed"] for c in categories for t in c["tests"])
    if not passed:
        return "📊 <b>Мои результаты</b>\n\nВы ещё не прошли ни одного теста."
    return f"📊 <b>Мои результаты</b>\n\nПройдено тестов: {passed}. Выберите тест, чтобы посмотреть результат."


# --- Навигация ---

@router.callback_query(kb.Menu.filter())
async def on_menu(callback: CallbackQuery, callback_data: kb.Menu, backend: Backend):
    if callback_data.action == "catalog":
        await show(callback, catalog_text(), kb.catalog(await backend.catalog(callback.from_user.id)))
    elif callback_data.action == "results":
        categories = await backend.catalog(callback.from_user.id)
        await show(callback, results_text(categories), kb.results(categories))
    else:
        await show(callback, WELCOME, kb.main_menu())


@router.callback_query(kb.CategoryCb.filter())
async def on_category(callback: CallbackQuery, callback_data: kb.CategoryCb, backend: Backend):
    category = await find_category(backend, callback.from_user.id, callback_data.id)
    if not category:
        return await callback.answer("Категория не найдена", show_alert=True)
    await show(callback, category_text(category), kb.category(category))


@router.callback_query(kb.TestCb.filter())
async def on_test(callback: CallbackQuery, callback_data: kb.TestCb, backend: Backend, state: FSMContext):
    test = await backend.test(callback_data.id, callback.from_user.id)
    if test["locked"]:
        return await callback.answer("Блок «Профориентация» открывается в приложении «Азбука Я»", show_alert=True)
    saved = len(await saved_answers(state, test["id"]))
    await show(callback, test_card_text(test, saved), kb.test_card(test, saved))


# --- Прохождение теста ---

@router.callback_query(kb.StartCb.filter())
async def on_start_test(callback: CallbackQuery, callback_data: kb.StartCb, backend: Backend, state: FSMContext):
    test = await backend.test_questions(callback_data.test_id, callback.from_user.id)
    answers = [] if callback_data.fresh else await saved_answers(state, test["id"])
    # Если тест успели изменить в админке — сохранённые ответы уже не подходят
    if len(answers) >= len(test["questions"]):
        answers = []
    await save_answers(state, test["id"], answers)
    await show_question(callback, test, len(answers))


@router.callback_query(kb.RetakeCb.filter())
async def on_retake(callback: CallbackQuery, callback_data: kb.RetakeCb, backend: Backend, state: FSMContext):
    test = await backend.test_questions(callback_data.test_id, callback.from_user.id)
    await backend.reset(test["id"], callback.from_user.id)
    await save_answers(state, test["id"], [])
    await show_question(callback, test, 0)


@router.callback_query(kb.PrevCb.filter())
async def on_prev(callback: CallbackQuery, callback_data: kb.PrevCb, backend: Backend, state: FSMContext):
    test = await backend.test_questions(callback_data.test_id, callback.from_user.id)
    answers = await saved_answers(state, test["id"])
    if answers:
        answers.pop()
    await save_answers(state, test["id"], answers)
    await show_question(callback, test, len(answers))


@router.callback_query(kb.AnswerCb.filter())
async def on_answer(callback: CallbackQuery, callback_data: kb.AnswerCb, backend: Backend, state: FSMContext):
    test = await backend.test_questions(callback_data.test_id, callback.from_user.id)
    answers = await saved_answers(state, test["id"])

    # Двойное нажатие или кнопка от старого вопроса — молча игнорируем
    if callback_data.index != len(answers) or callback_data.index >= len(test["questions"]):
        return await callback.answer()

    answers.append(callback_data.answer_id)
    if len(answers) < len(test["questions"]):
        await save_answers(state, test["id"], answers)
        return await show_question(callback, test, len(answers))

    result = await submit(callback.from_user, backend, test, answers)
    await save_answers(state, test["id"], None)
    await show(
        callback,
        f"✅ <b>Тест пройден!</b>\n<b>{escape(test['name'])}</b>\n\n📊 <b>Ваш результат:</b>\n{escape(result)}",
        kb.after_result(test),
    )


async def submit(user: User, backend: Backend, test: dict, answers: list[int]) -> str:
    try:
        return await backend.submit(test["id"], user, answers)
    except BackendError as e:
        if e.status == 400:
            # Тест изменили, пока его проходили: свежие вопросы при следующем старте
            backend.forget_test(test["id"])
        raise


# --- Ошибки бэкенда ---

@router.errors(ExceptionTypeFilter(BackendError))
async def on_backend_error(event: ErrorEvent):
    error: BackendError = event.exception
    log.warning("Backend error: %s", error)
    if error.status == 400:
        text = "Тест обновился, пока вы его проходили. Начните его заново, пожалуйста."
    elif error.status in (403, 404):
        text = error.detail
    else:
        text = "Сервис временно недоступен. Попробуйте через пару минут."

    callback = event.update.callback_query
    if callback:
        await callback.answer(text, show_alert=True)
    elif event.update.message:
        await event.update.message.answer(text)
