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


def _create_payment(amount: Decimal, chat_id, description: str, email: str):
    key = str(uuid.uuid4())
    try:
        payment = Payment.create(
            {
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

    return payment.confirmation.confirmation_url, payment.id


def _check_payment(payment_id):
    payment = yookassa.Payment.find_one(payment_id)
    if payment.status == "succeeded":
        return payment.metadata
    else:
        return False
