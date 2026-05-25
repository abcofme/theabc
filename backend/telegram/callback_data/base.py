from typing import TypeVar

from aiogram.filters.callback_data import CallbackData

C = TypeVar('C', bound=CallbackData)


class Back(CallbackData, prefix="back"):
    delete: bool = False


class SliderPage(CallbackData, prefix="slider"):
    page: int
