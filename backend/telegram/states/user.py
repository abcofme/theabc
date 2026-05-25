from aiogram.fsm.state import StatesGroup, State


class TechStates(StatesGroup):
    message = State()
