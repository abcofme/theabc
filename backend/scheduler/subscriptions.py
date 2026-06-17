import asyncio
from datetime import datetime, timedelta

from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_

from backend.database import engine
from backend.database.models import User, Payment
from backend.scheduler import scheduler
from backend.integrations.payment.yoo import _create_recurring_payment, _check_payment
from backend.telegram.bot import bot

@scheduler.scheduled_job(IntervalTrigger(hours=1))
async def process_recurring_subscriptions():
    """
    Checks for subscriptions that are expiring in the next 24 hours
    and attempts to auto-renew them using the saved payment method.
    """
    async with AsyncSession(engine) as session:
        now = datetime.utcnow()
        # Look for users whose premium is expiring in the next 24 hours
        # and who have a saved payment method
        target_time = now + timedelta(hours=24)
        
        query = select(User).where(
            User.premium_until != None,
            User.premium_until <= target_time,
            User.premium_until >= now - timedelta(days=3), # Don't try if it expired long ago
            User.yookassa_payment_method_id != None
        )
        
        users = (await session.execute(query)).scalars().all()
        
        for user in users:
            # Check if there is already a pending recurring payment for this period
            pending_query = select(Payment).where(
                Payment.user_id == user.id,
                Payment.is_premium_subscription == True,
                Payment.is_recurring == True,
                Payment.success == False,
                Payment.created_at >= now - timedelta(hours=24)
            )
            pending = (await session.execute(pending_query)).scalars().first()
            
            if pending:
                # Check status
                meta, amount, _ = await _check_payment(pending.uuid)
                if meta is not False: # succeeded
                    pending.success = True
                    user.premium_until += timedelta(days=30)
                    
                    if user.invited_id:
                        try:
                            inviter_id = int(user.invited_id)
                            inviter = await session.get(User, inviter_id)
                            if inviter:
                                inviter.referral_balance_pending += int(amount / 2)
                        except ValueError:
                            pass
                    
                    try:
                        await bot.send_message(user.id, "Ваша подписка Premium успешно продлена на месяц!")
                    except:
                        pass
                else:
                    # Still pending or failed. We don't create a new one yet.
                    pass
                continue
                
            # Create a new recurring payment
            try:
                status, payment_id = await _create_recurring_payment(
                    amount=149,
                    chat_id=str(user.id),
                    description="Продление Premium подписки",
                    email="",
                    payment_method_id=user.yookassa_payment_method_id
                )
                
                new_payment = Payment(
                    user_id=user.id,
                    uuid=payment_id,
                    is_premium_subscription=True,
                    is_recurring=True,
                    success=(status == "succeeded")
                )
                session.add(new_payment)
                
                if status == "succeeded":
                    user.premium_until += timedelta(days=30)
                    if user.invited_id:
                        try:
                            inviter_id = int(user.invited_id)
                            inviter = await session.get(User, inviter_id)
                            if inviter:
                                inviter.referral_balance_pending += int(149 / 2)
                        except ValueError:
                            pass
                            
                    try:
                        await bot.send_message(user.id, "Ваша подписка Premium успешно продлена на месяц!")
                    except:
                        pass
                        
            except Exception as e:
                print(f"Error processing recurring payment for user {user.id}: {e}")
                
        await session.commit()
