import asyncio
from datetime import datetime

from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import engine
from backend.database.models import Mailing, User
from backend.database.patterns.dao import DataAccessObject
from backend.database.patterns.mailings import MailingDAO
from backend.scheduler import scheduler
from backend.telegram.bot import bot

BATCH_SIZE = 50


@scheduler.scheduled_job(IntervalTrigger(minutes=1))
async def mailings():
    async with AsyncSession(engine, expire_on_commit=False) as session:
        dao = DataAccessObject(session)

        mailings: list[Mailing] = await MailingDAO(dao).get_mailings(was_notified=False)  # NOQA
        if mailings:
            users = await dao.get_all(User)

            for mailing in mailings:
                await dao.update_object(Mailing, mailing.id, dict(was_notified=True))

                for index in range(0, len(users), BATCH_SIZE):
                    batch_users_to_mail = users[index:index + BATCH_SIZE]
                    results = await asyncio.gather(
                        *[
                            send(mailing, user) for user in batch_users_to_mail
                        ],
                        # return_exceptions=True
                    )
                    # _mailing = await dao.get_object(Mailing, mailing.id)
                    # if _mailing.was_stopped:
                    #     return

                await dao.update_object(Mailing, mailing.id, dict(completed_at=datetime.now(), sent=results))
                await bot.send_message(
                    chat_id=mailing.user_id,
                    text="Рассылка успешно закончилась"
                )


async def send(mailing: Mailing, user: User):
    results = await asyncio.gather(
        *[
            bot.copy_message(
                chat_id=user.id,
                from_chat_id=mailing.chat_id,
                message_id=message_id
            )
            for message_id in mailing.message_ids
        ],
        return_exceptions=True
    )
    messages, exceptions = [], []
    for result in results:
        (messages, exceptions)[isinstance(result, Exception)].append(result)
    if not exceptions:
        return [message.message_id for message in messages], user.id
    await asyncio.gather(
        *[
            bot.delete_message(
                chat_id=user.id,
                message_id=message.message_id,
            ) for message in messages
        ]
    )
    raise ExceptionGroup(f'Error during sending Mailing {mailing.id}', exceptions)
