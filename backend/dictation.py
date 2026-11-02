"""Диктовка записей дневника: доступ, лимиты, журнал и алерты о скорости распознавания.

Доступ — с Premium. Без него одна пробная диктовка на человека: считается, только если текст распознан.
Сам эндпоинт — POST /api/diary/transcribe (backend/api/routers/diary.py), распознает сервис stt (stt/app.py).
"""
from datetime import datetime

from sqlalchemy import exists, select

from backend.alerts import raise_alert
from backend.database import async_session
from backend.database.models import DictationLog
from backend.redis_db import async_redis

# Фронт останавливает запись через 5 минут — это ~5 МБ даже в AAC 128 кбит/с
MAX_BYTES = 16 * 1024 * 1024
# Защита сервера от одного человека: столько диктовок в час и столько минут записи в сутки
PER_HOUR = 40
SECONDS_PER_DAY = 60 * 60

# Алерты о скорости. Обычно минута речи распознается за ~6 с (0,1 от длины записи)
SLOW_SECONDS = 30  # очередь + распознавание одной диктовки
SLOW_RATIO = 0.5  # распознавание дольше половины длины записи — процессор не справляется
SLOW_RATIO_MIN_AUDIO = 10  # на коротких записях доля врет из-за постоянных накладных расходов


async def trial_used(session, user_id: int) -> bool:
    return bool(await session.scalar(select(exists().where(
        DictationLog.user_id == user_id, DictationLog.trial.is_(True), DictationLog.status == "ok",
    ))))


def _day_key(user_id: int) -> str:
    return f"dictation-seconds:{user_id}:{datetime.utcnow():%Y%m%d}"


async def check_limits(user_id: int) -> str | None:
    """Текст отказа, если человек уперся в лимит, иначе None"""
    hour_key = f"dictation:{user_id}"
    count = await async_redis.incr(hour_key)
    if count == 1:
        await async_redis.expire(hour_key, 60 * 60)
    if count > PER_HOUR:
        return "Слишком много диктовок подряд. Попробуй через час или напиши текстом"
    if float(await async_redis.get(_day_key(user_id)) or 0) >= SECONDS_PER_DAY:
        return "На сегодня лимит диктовки исчерпан — продолжи текстом, завтра он обновится"
    return None


async def record(user_id: int, status: str, trial: bool, result: dict | None = None, total: float | None = None):
    """Журнал диктовки, счетчик минут за сутки и алерт, если распознавание стало слишком долгим"""
    result = result or {}
    audio, wait, took = result.get("seconds"), result.get("wait"), result.get("took")
    if audio:
        key = _day_key(user_id)
        await async_redis.incrbyfloat(key, audio)
        await async_redis.expire(key, 2 * 24 * 60 * 60)
    async with async_session() as session:
        session.add(DictationLog(
            user_id=user_id, status=status, trial=trial,
            audio_seconds=audio, wait_seconds=wait, process_seconds=took, total_seconds=total,
        ))
        await session.commit()

    # Алерт уходит в Telegram — не задерживаем им ответ человеку
    from backend.api.common import run_in_background
    run_in_background(_check_speed(audio, wait, took))


async def _check_speed(audio: float | None, wait: float | None, took: float | None):
    if wait is None or took is None:
        return
    if wait + took > SLOW_SECONDS:
        await raise_alert(
            "dictation_slow", "Диктовка расшифровывается слишком долго",
            f"Ответ через {wait + took:.0f} с: очередь {wait:.0f} с, распознавание {took:.0f} с, запись {audio or 0:.0f} с. "
            f"Порог — {SLOW_SECONDS} с.",
        )
    elif audio and audio >= SLOW_RATIO_MIN_AUDIO and took / audio > SLOW_RATIO:
        await raise_alert(
            "dictation_cpu", "Распознавание речи замедлилось",
            f"Запись {audio:.0f} с распознавалась {took:.0f} с — это {took / audio:.0%} ее длины (обычно ~10%). "
            "Процессор сервера занят или ему не хватает ресурсов.",
        )
