"""Алерты для админов: сообщение в Telegram и запись в админ-панели (раздел «Мониторинг»).

Одинаковые алерты не сыплются подряд: пока идет пауза, повтор только увеличивает count у последнего алерта этого вида.
Вызывают api (медленная или упавшая диктовка) и планировщик бота (ресурсы сервиса распознавания, раз в минуту).
"""
import html
from datetime import datetime

from loguru import logger
from sqlalchemy import or_, select, update

from backend.database import async_session
from backend.database.models import AdminAlert, User
from backend.redis_db import async_redis

# Сколько молчим после алерта того же вида
ALERT_PAUSE_SECONDS = 30 * 60


async def _admin_ids(session) -> list[int]:
    from backend.api.common import ADMIN_USERNAMES

    rows = await session.execute(select(User.id).where(or_(User.admin.is_(True), User.username.in_(list(ADMIN_USERNAMES)))))
    return [row[0] for row in rows]


async def raise_alert(kind: str, title: str, text: str) -> None:
    """Новый алерт — в базу и админам в Telegram. Ошибка здесь не должна ломать то, что алерт вызвало"""
    try:
        is_new = await async_redis.set(f"alert-pause:{kind}", 1, ex=ALERT_PAUSE_SECONDS, nx=True)
        async with async_session() as session:
            if not is_new:
                last = (await session.execute(
                    select(AdminAlert.id).where(AdminAlert.kind == kind).order_by(AdminAlert.id.desc()).limit(1)
                )).scalar()
                if last:
                    await session.execute(update(AdminAlert).where(AdminAlert.id == last).values(
                        count=AdminAlert.count + 1, last_at=datetime.utcnow(), text=text, seen=False,
                    ))
                    await session.commit()
                    return
            session.add(AdminAlert(kind=kind, title=title, text=text, last_at=datetime.utcnow()))
            await session.commit()
            admins = await _admin_ids(session)
        logger.warning(f"Alert {kind}: {title} — {text}")

        from backend.telegram.notify import notify
        message = f"🚨 <b>{html.escape(title)}</b>\n\n{html.escape(text)}"
        for admin_id in admins:
            await notify(admin_id, message, "tab=profile&page=admin&section=monitoring", "Мониторинг")
    except Exception as e:
        logger.error(f"Alert {kind} failed: {e!r}")
