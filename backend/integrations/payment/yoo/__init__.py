import asyncio
import uuid
from dataclasses import dataclass
from decimal import Decimal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import yookassa
from yookassa import Payment

from settings import settings

# ! Конфигурация не должна быть в разных файлах !
yookassa.Configuration.account_id = settings.ACCOUNT_ID
yookassa.Configuration.secret_key = settings.SECRET_KEY

# Чек в запросе не передаём: исполнитель — самозанятый, ЮKassa чеки за самозанятых не формирует,
# доход регистрируется в «Мой налог». Для ИП/ООО сюда добавится receipt с email покупателя


@dataclass
class PaymentInfo:
    status: str  # pending, waiting_for_capture, succeeded, canceled
    amount: Decimal
    currency: str
    payment_method_id: str | None  # сохранённый способ оплаты — для автопродления
    cancel_reason: str | None


async def _create(payload: dict) -> Payment:
    return await asyncio.to_thread(Payment.create, payload, str(uuid.uuid4()))


def _return_url() -> str:
    if settings.PAYMENT_RETURN_URL:
        return settings.PAYMENT_RETURN_URL
    base = urlsplit(settings.WEB_APP_URL)
    query = dict(parse_qsl(base.query, keep_blank_values=True))
    query["page"] = "billing"
    return urlunsplit(base._replace(query=urlencode(query)))


async def _create_payment(
    amount: int, chat_id, description: str, save_payment_method: bool = False, return_url: str | None = None
):
    """Платёж с переходом на страницу ЮKassa. Способ оплаты (карта, СБП, SberPay, T-Pay) выбирает пользователь;
    с save_payment_method ЮKassa покажет только способы, которые можно сохранить для автопродления"""
    payment = await _create({
        "amount": {"value": f"{amount}.00", "currency": "RUB"},
        "confirmation": {"type": "redirect", "return_url": return_url or _return_url()},
        "capture": True,
        "save_payment_method": save_payment_method,
        "metadata": {"chat_id": chat_id},
        "description": description,
    })
    return payment.confirmation.confirmation_url, payment.id


async def _create_recurring_payment(amount: int, chat_id, description: str, payment_method_id: str):
    """Списание сохранённым способом оплаты, без участия пользователя"""
    payment = await _create({
        "amount": {"value": f"{amount}.00", "currency": "RUB"},
        "payment_method_id": payment_method_id,
        "capture": True,
        "metadata": {"chat_id": chat_id},
        "description": description,
    })
    return payment.status, payment.id


async def _check_payment(payment_id) -> PaymentInfo:
    """Состояние платежа из API ЮKassa — единственный источник правды: телу вебхука не доверяем"""
    payment = await asyncio.to_thread(Payment.find_one, payment_id)
    method = payment.payment_method
    return PaymentInfo(
        status=payment.status,
        amount=Decimal(payment.amount.value),
        currency=payment.amount.currency,
        payment_method_id=method.id if method and getattr(method, "saved", False) else None,
        cancel_reason=payment.cancellation_details.reason if payment.cancellation_details else None,
    )
