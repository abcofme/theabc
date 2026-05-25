from aiogram.fsm.state import StatesGroup, State


class TestsStates(StatesGroup):
    slider = State()


class BuyTestsStates(StatesGroup):
    name = State()
    email = State()
