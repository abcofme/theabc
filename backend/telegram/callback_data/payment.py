from aiogram.filters.callback_data import CallbackData


class PaymentCallback(CallbackData, prefix="payment_data"):
    payment_id: str
