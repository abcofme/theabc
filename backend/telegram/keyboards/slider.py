from typing import Type

from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.utils.i18n import gettext
from aiogram.utils.keyboard import InlineKeyboardBuilder

from backend.database.patterns.dao import DataAccessObject, T
from backend.telegram.callback_data.base import SliderPage, C
from backend.telegram.keyboards.base import back_btn


# прокачать лимитом в дао + кэш
async def slider_kb(
        db_model: Type[T], callback_data: Type[C], dao: DataAccessObject,
        page: int = 0, part: int = 1, conditions: dict = None, _enumerate: bool = False
) -> InlineKeyboardMarkup:
    def chunks(_list, _count):
        for i in range(0, len(_list), _count):
            yield _list[i:i + _count]

    if conditions:
        models = await dao.filter(db_model, conditions)
    else:
        models = await dao.get_all(db_model)

    try:
        models = sorted(models, key=lambda x: (x.order_number is None, x.order_number))
    except:
        pass

    models = list(chunks(models, part))
    buttons = []
    if models:
        current_models = models[page]

        for i, current_model in enumerate(current_models, start=1):
            buttons.append(
                [
                    InlineKeyboardButton(
                        text=current_model.name,
                        callback_data=callback_data(id=current_model.id).pack()
                    ),
                ]
            )

        if len(models) > 1:
            slider_buttons = []
            if page > 0:
                slider_buttons.append(
                    InlineKeyboardButton(
                        text=gettext("buttons.left"),
                        callback_data=SliderPage(page=page - 1).pack())
                )
            if page < len(models) - 1:
                slider_buttons.append(
                    InlineKeyboardButton(
                        text=gettext("buttons.right"),
                        callback_data=SliderPage(page=page + 1).pack())
                )
            buttons.append(slider_buttons)

    buttons.append(
        [back_btn()]
    )

    return InlineKeyboardBuilder(
        buttons
    ).as_markup()
