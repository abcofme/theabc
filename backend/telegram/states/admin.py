from aiogram.fsm.state import StatesGroup, State


class AdminStates(StatesGroup):
    link = State()


class AdminMailingStates(StatesGroup):
    message = State()
    scheduled_at = State()
    all = State()
    accept = State()
