from aiogram.filters.callback_data import CallbackData


class Profile(CallbackData, prefix="profile"):
    pass


class Psychologist(CallbackData, prefix="psychologist"):
    pass


class MainMenu(CallbackData, prefix="main_menu"):
    pass


class TechSupport(CallbackData, prefix="tech_support"):
    pass


class Referal(CallbackData, prefix="referal"):
    pass
