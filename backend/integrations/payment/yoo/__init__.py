import asyncio
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

import httpx
import yookassa
from yookassa import Payment
from yookassa.domain.response import PaymentResponse

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
    renewal_key: str | None = None
    payment_method_label: str | None = None
    captured_at: datetime | None = None


CARD_BRANDS = {
    "MasterCard": "Mastercard", "Visa": "Visa", "MIR": "Мир", "UnionPay": "UnionPay",
    "JCB": "JCB", "AmericanExpress": "American Express", "DinersClub": "Diners Club",
}
PAYMENT_METHOD_NAMES = {
    "sbp": "СБП", "yoo_money": "ЮMoney", "tinkoff_bank": "T-Pay",
    "sberbank": "SberPay", "alfa_pay": "Alfa Pay",
}


def _payment_method_label(method) -> str:
    if method.type != "bank_card":
        return PAYMENT_METHOD_NAMES.get(method.type, "Сохранённый способ оплаты")
    card = getattr(method, "card", None)
    brand = CARD_BRANDS.get(getattr(card, "card_type", None), "Банковская карта")
    last4 = getattr(card, "last4", None)
    return f"{brand} •••• {last4}" if isinstance(last4, str) and re.fullmatch(r"[0-9]{4}", last4) else brand


async def _create(payload: dict) -> Payment:
    return await asyncio.to_thread(Payment.create, payload, str(uuid.uuid4()))


async def _request_payment(method: str, path: str = "", **kwargs) -> PaymentResponse:
    # SDK 3.1 не задаёт сетевой таймаут. Ограничиваем ожидание ответа ЮKassa.
    async with asyncio.timeout(40), httpx.AsyncClient(timeout=35) as client:
        response = await client.request(
            method, f"https://api.yookassa.ru/v3/payments{path}",
            auth=(settings.ACCOUNT_ID, settings.SECRET_KEY), **kwargs,
        )
        response.raise_for_status()
        return PaymentResponse(response.json())


def _return_url() -> str:
    if settings.PAYMENT_RETURN_URL:
        return settings.PAYMENT_RETURN_URL
    base = urlsplit(settings.WEB_APP_URL)
    query = dict(parse_qsl(base.query, keep_blank_values=True))
    query["page"] = "billing"
    return urlunsplit(base._replace(query=urlencode(query)))


async def _create_payment(
    amount: int,
    chat_id,
    description: str,
    save_payment_method: bool = False,
    return_url: str | None = None,
    method: str | None = None,
):
    """Открывает выбранный способ оплаты или общую форму ЮKassa."""
    payload = {
        "amount": {"value": f"{amount}.00", "currency": "RUB"},
        "confirmation": {"type": "redirect", "return_url": return_url or _return_url()},
        "capture": True,
        "save_payment_method": save_payment_method,
        "metadata": {"chat_id": chat_id},
        "description": description,
    }
    if method:
        payload["payment_method_data"] = {"type": method}
    payment = await _create(payload)
    return payment.confirmation.confirmation_url, payment.id


async def _create_recurring_payment(
    amount: int, chat_id: str, description: str, payment_method_id: str, renewal_key: str
):
    """Списание сохранённым способом оплаты, без участия пользователя"""
    payload = {
        "amount": {"value": f"{amount}.00", "currency": "RUB"},
        "payment_method_id": payment_method_id,
        "capture": True,
        "metadata": {"chat_id": chat_id, "renewal_key": renewal_key},
        "description": description,
    }
    payment = await _request_payment("POST", headers={"Idempotence-Key": renewal_key}, json=payload)
    return payment.id


async def _check_payment(payment_id) -> PaymentInfo:
    """Состояние платежа из API ЮKassa — единственный источник правды: телу вебхука не доверяем"""
    payment = await _request_payment("GET", f"/{quote(payment_id, safe='')}")
    method = payment.payment_method
    saved_method_id = method.id if method and getattr(method, "saved", False) else None
    captured_at = None
    if payment.captured_at:
        try:
            captured_at = datetime.fromisoformat(str(payment.captured_at))
            if captured_at.tzinfo:
                captured_at = captured_at.astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError:
            pass
    return PaymentInfo(
        status=payment.status,
        amount=Decimal(payment.amount.value),
        currency=payment.amount.currency,
        payment_method_id=saved_method_id,
        cancel_reason=payment.cancellation_details.reason if payment.cancellation_details else None,
        renewal_key=(payment.metadata or {}).get("renewal_key"),
        payment_method_label=_payment_method_label(method) if saved_method_id else None,
        captured_at=captured_at,
    )
