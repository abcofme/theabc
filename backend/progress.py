from datetime import datetime

from sqlalchemy import select

from backend.database.models import Progress, ProgressLog, User


async def lock_user_progress(session, user_id: int):
    # Проверка результата, сброс и запись прохождения одного пользователя идут последовательно.
    await session.execute(select(User.id).where(User.id == user_id).with_for_update(key_share=True))


def save_test_progress(session, progress: Progress):
    progress.created_at = datetime.utcnow()
    session.add_all([
        progress,
        ProgressLog(user_id=progress.user_id, test_id=progress.test_id, created_at=progress.created_at),
    ])
