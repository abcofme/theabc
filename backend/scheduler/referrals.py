import logging
from sqlalchemy import select
from backend.database import async_session
from backend.database.models import User
from backend.scheduler import scheduler

logger = logging.getLogger(__name__)

async def transfer_referral_balances():
    try:
        async with async_session() as session:
            # We want to transfer pending to available and reset pending
            query = select(User).where(User.referral_balance_pending > 0)
            users = (await session.execute(query)).scalars().all()
            
            for user in users:
                user.referral_balance_available = (user.referral_balance_available or 0) + user.referral_balance_pending
                user.referral_balance_pending = 0
            
            await session.commit()
            logger.info(f"Successfully transferred referral balances for {len(users)} users.")
    except Exception as e:
        logger.error(f"Error transferring referral balances: {e}")

# Run on the 1st day of every month at 00:00
scheduler.add_job(
    transfer_referral_balances,
    'cron',
    day=1,
    hour=0,
    minute=0
)
