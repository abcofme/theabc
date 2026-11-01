from aiogram.filters.callback_data import CallbackData


class TestData(CallbackData, prefix="test_data"):
    pass


# Подтверждение входа на сайте: code — код из ссылки t.me/<бот>?start=login_<код>
class WebLogin(CallbackData, prefix="web_login"):
    code: str
