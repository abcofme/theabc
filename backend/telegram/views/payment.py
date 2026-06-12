from decimal import Decimal, ROUND_HALF_UP

from backend.integrations.payment.yoo import _create_payment, _check_payment
from backend.telegram.keyboards.tests import *


async def check_payment(user: User, dao: DataAccessObject, payment_id: str):
    result = _check_payment(payment_id)
    if result and result[0]:
        metadata, amount = result
        payments = await dao.filter(Payment, dict(uuid=payment_id, user_id=user.id))
        
        # Determine if we actually processed any new payments
        newly_processed = False
        for payment in payments:
            if not payment.success:
                newly_processed = True
                await dao.update_object(Payment, payment.id, dict(success=True))
            
        # Add 50% to referrer if invited_id is present and we haven't processed this payment before
        if newly_processed and user.invited_id:
            try:
                referrer_id = int(user.invited_id)
                referrer = await dao.get_object(User, referrer_id)
                if referrer:
                    new_balance = (referrer.referral_balance_pending or 0) + int(amount * 0.5)
                    await dao.update_object(User, referrer_id, dict(referral_balance_pending=new_balance))
            except ValueError:
                pass
        
        return True
    else:
        return False


async def set_payment(user: User, dao: DataAccessObject, category_ids: list[int]):
    for category_id in category_ids:
        payment = Payment(
            uuid="100% discount",  # NOQA
            url="100% discount",  # NOQA
            success=True,  # NOQA
            user_id=user.id,  # NOQA
            category_id=category_id  # NOQA
        )
        await dao.add_object(payment)  # NOQA


async def create_payment(
        user: User, dao: DataAccessObject, amount: Decimal,
        description: str, category_ids: list[int], email: str
) -> (str, str):
    payment_url, payment_id = _create_payment(amount=amount, chat_id=user.id, description=description, email=email)
    for category_id in category_ids:
        payment = Payment(
            uuid=payment_id,  # NOQA
            url=payment_url,  # NOQA
            success=False,  # NOQA
            user_id=user.id,  # NOQA
            category_id=category_id  # NOQA
        )
        await dao.add_object(payment)  # NOQA
    return payment_url, payment_id


def calculate_discount(amount: int, user: User) -> Decimal:
    if user.discount_pct:
        if user.discount_pct >= 100:
            return Decimal(0)
        else:
            user.discount_pct: int
            discount_factor = Decimal(1) - Decimal(user.discount_pct) / Decimal(100)
            discounted_price = Decimal(amount) * discount_factor
            return discounted_price.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    else:
        return Decimal(amount)
