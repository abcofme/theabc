import uuid
from decimal import Decimal

import yookassa
from loguru import logger
from requests import HTTPError
from yookassa import Payment

from settings import settings

# ! Конфигурация не должна быть в разных файлах !
yookassa.Configuration.account_id = settings.ACCOUNT_ID
yookassa.Configuration.secret_key = settings.SECRET_KEY


def _create_payment(amount: Decimal, chat_id, description: str, email: str, save_payment_method: bool = False):
    key = str(uuid.uuid4())
    try:
        payment_payload = {
            "amount": {
                "value": str(amount),
                "currency": "RUB"
            },
            "payment_method_data": {
                "type": "bank_card"
            },
            "confirmation": {
                "type": "redirect",
                "return_url": settings.BOT_LINK
            },
            "capture": True,
            "save_payment_method": save_payment_method,
                "metadata": {
                    "chat_id": chat_id
                },
                "description": description,
                "receipt": {
                    "customer": {
                        "email": email
                    },
                    "items": [
                        {
                            "description": description,
                            "quantity": 1.000,
                            "amount": {
                                "value": str(amount),
                                "currency": "RUB"
                            },
                            "vat_code": 1,
                            "payment_mode": "full_prepayment",
                            "payment_subject": "commodity"
                        }
                    ]
                }
        }
        payment = Payment.create(payment_payload, key)
    except HTTPError as e:
        logger.warning(f"ERROR_IS: {e.response.json()}")
        raise e

    return payment.confirmation.confirmation_url, payment.id

def _create_recurring_payment(amount: Decimal, chat_id, description: str, email: str, payment_method_id: str):
    key = str(uuid.uuid4())
    try:
        payment = Payment.create(
            {
                "amount": {
                    "value": str(amount),
                    "currency": "RUB"
                },
                "payment_method_id": payment_method_id,
                "capture": True,
                "metadata": {
                    "chat_id": chat_id
                },
                "description": description,
                "receipt": {
                    "customer": {
                        "email": email
                    },
                    "items": [
                        {
                            "description": description,
                            "quantity": 1.000,
                            "amount": {
                                "value": str(amount),
                                "currency": "RUB"
                            },
                            "vat_code": 1,
                            "payment_mode": "full_prepayment",
                            "payment_subject": "commodity"
                        }
                    ]
                }
            }, key
        )
    except HTTPError as e:
        logger.warning(f"ERROR_IS: {e.response.json()}")
        raise e

    return payment.status, payment.id


def _check_payment(payment_id):
    payment = yookassa.Payment.find_one(payment_id)
    if payment.status == "succeeded":
        payment_method_id = None
        if payment.payment_method and getattr(payment.payment_method, "saved", False):
            payment_method_id = payment.payment_method.id
        return payment.metadata, float(payment.amount.value), payment_method_id
    else:
        return False, 0.0, None

def _create_payout_self_employed(amount: float, inn: str, description: str):
    import uuid
    from yookassa import Payout
    key = str(uuid.uuid4())
    try:
        # Примечание: Для реальных выплат самозанятым через ЮKassa 
        # обычно используется payout_token, полученный после привязки самозанятого,
        # или передается объект deal / personal_data с ИНН.
        # Ниже приведен пример структуры, которая должна быть адаптирована 
        # под конкретный сценарий подключения "Выплаты самозанятым" в вашем кабинете.
        payout = Payout.create(
            {
                "amount": {
                    "value": str(amount),
                    "currency": "RUB"
                },
                "payout_destination_data": {
                    "type": "yoo_money", # Чаще всего самозанятые привязывают кошелек ЮMoney
                },
                "deal": {
                    "id": inn # Здесь обычно передается ID сделки или токен привязки, зависящий от ИНН
                },
                "description": description
            }, key
        )
        return payout.status, payout.id
    except HTTPError as e:
        logger.warning(f"PAYOUT_ERROR: {e.response.json()}")
        raise e
