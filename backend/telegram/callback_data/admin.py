from aiogram.filters.callback_data import CallbackData


class AdminMenu(CallbackData, prefix="admin_menu"):
    pass


class AdminCreateMailing(CallbackData, prefix="admin_create_mailing"):
    pass


class AdminMenuMailings(CallbackData, prefix="admin_mailings"):
    pass


class AdminAcceptCreateMailing(CallbackData, prefix="accept_create_mailing"):
    pass
