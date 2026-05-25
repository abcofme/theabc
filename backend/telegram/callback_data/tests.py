from aiogram.filters.callback_data import CallbackData


class Tests(CallbackData, prefix="tests"):
    pass


class BuyAllTests(CallbackData, prefix="buy_all_tests"):
    pass


class CategoryChoose(CallbackData, prefix="category_choose"):
    category_id: int
    profile: bool = False


class FreeTests(CallbackData, prefix="free_tests"):
    category_id: int


class FullTests(CallbackData, prefix="full_tests"):
    category_id: int
    opened: bool


class TestChoose(CallbackData, prefix="test_choose"):
    id: int


class TestAcceptChoose(CallbackData, prefix="test_accept_choose"):
    id: int


class BackQuestion(CallbackData, prefix="back_question"):
    pass


class AnswerChoose(CallbackData, prefix="answer_choose"):
    answer_id: int
