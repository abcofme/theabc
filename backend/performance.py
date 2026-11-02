"""Производительность проекта: замеры запросов к API, ресурсы сервера и сервиса распознавания, отчет для админ-панели.

- Каждый запрос к API (TimingMiddleware в backend/api/main.py) — в часовые счетчики Redis по маршрутам: число, сумма
  времени, ошибки 5xx и корзины длительности, по которым считаются перцентили.
- Раз в минуту планировщик бота (backend/scheduler/monitoring.py) снимает ресурсы сервера и stt и проверяет пороги алертов.
- Отчет (GET /api/admin/performance) собирает это вместе с журналом диктовок за 24 часа или 7 дней.
"""
import json
import os
import shutil
import time
from datetime import datetime, timedelta

import httpx
from loguru import logger
from sqlalchemy import text

from backend.alerts import raise_alert
from backend.redis_db import async_redis
from settings import settings

# Верхние границы корзин длительности запроса, мс; последняя корзина — все, что дольше
BUCKETS_MS = [100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000]
API_TTL = 8 * 24 * 60 * 60
SAMPLES_KEY = "perf:samples"
SAMPLES_KEEP = 7 * 24 * 60  # неделя минутных замеров

# Пороги алертов о ресурсах
STT_MEMORY_SHARE = 0.85  # память stt от его лимита в docker-compose.yml
STT_QUEUE = 4  # диктовок ждут очереди одновременно
STT_CPU_SHARE = 0.9  # stt занимает почти все ядра…
STT_CPU_MINUTES = 5  # …столько минут подряд
STT_DOWN_MINUTES = 2  # stt не отвечает столько проверок подряд (одна — обычный перезапуск при деплое)
SERVER_MEMORY_FREE = 0.10  # свободной памяти сервера меньше этой доли
SERVER_DISK_USED = 0.90


def _plural(n: int, one: str, few: str, many: str) -> str:
    if 10 < n % 100 < 20:
        return many
    return one if n % 10 == 1 else few if 2 <= n % 10 <= 4 else many


def _hour_key(moment: datetime) -> str:
    return f"perf:api:{moment:%Y%m%d%H}"


async def record_request(route: str, status: int, ms: float):
    bucket = next((i for i, bound in enumerate(BUCKETS_MS) if ms <= bound), len(BUCKETS_MS))
    key = _hour_key(datetime.utcnow())
    try:
        async with async_redis.pipeline(transaction=False) as pipe:
            pipe.hincrby(key, f"{route}|n", 1)
            pipe.hincrbyfloat(key, f"{route}|ms", ms)
            pipe.hincrby(key, f"{route}|b{bucket}", 1)
            if status >= 500:
                pipe.hincrby(key, f"{route}|err", 1)
            pipe.expire(key, API_TTL)
            await pipe.execute()
    except Exception as e:
        # Замер не должен мешать самому запросу
        logger.warning(f"Perf record failed: {e!r}")


def _percentile(buckets: list[int], share: float) -> int | None:
    """Верхняя граница корзины, в которую попадает перцентиль. Дольше последней границы — None («больше минуты»)"""
    total = sum(buckets)
    if not total:
        return 0
    seen = 0
    for i, count in enumerate(buckets):
        seen += count
        if seen >= share * total:
            return BUCKETS_MS[i] if i < len(BUCKETS_MS) else None
    return None


async def api_report(hours: int) -> dict:
    now = datetime.utcnow()
    routes: dict[str, dict] = {}
    for h in range(hours):
        data = await async_redis.hgetall(_hour_key(now - timedelta(hours=h)))
        for field, value in data.items():
            field = field.decode() if isinstance(field, bytes) else field
            route, metric = field.rsplit("|", 1)
            item = routes.setdefault(route, {"n": 0, "ms": 0.0, "err": 0, "buckets": [0] * (len(BUCKETS_MS) + 1)})
            if metric.startswith("b"):
                item["buckets"][int(metric[1:])] += int(value)
            elif metric == "ms":
                item["ms"] += float(value)
            else:
                item[metric] += int(value)
    total_buckets = [sum(r["buckets"][i] for r in routes.values()) for i in range(len(BUCKETS_MS) + 1)]
    rows = sorted((
        {
            "route": route, "count": r["n"], "errors": r["err"],
            "avg_ms": round(r["ms"] / r["n"]) if r["n"] else 0,
            "p50_ms": _percentile(r["buckets"], 0.5), "p95_ms": _percentile(r["buckets"], 0.95),
        }
        for route, r in routes.items()
    ), key=lambda row: row["count"], reverse=True)
    count = sum(r["n"] for r in routes.values())
    return {
        "count": count,
        "errors": sum(r["err"] for r in routes.values()),
        "avg_ms": round(sum(r["ms"] for r in routes.values()) / count) if count else 0,
        "p95_ms": _percentile(total_buckets, 0.95),
        "routes": rows,
    }


def _server() -> dict:
    """Сервер целиком: /proc внутри контейнера показывает память и процессор хоста"""
    memory = {}
    with open("/proc/meminfo") as f:
        for line in f:
            name, value = line.split(":", 1)
            memory[name] = int(value.split()[0]) * 1024
    with open("/proc/stat") as f:
        cpu = [int(v) for v in f.readline().split()[1:]]
    disk = shutil.disk_usage("/")
    return {
        "cpus": os.cpu_count(),
        "load": os.getloadavg()[0],
        "cpu_busy": sum(cpu) - cpu[3] - cpu[4],  # все, кроме idle и iowait
        "cpu_total": sum(cpu),
        "memory_total": memory["MemTotal"],
        "memory_free": memory["MemAvailable"],
        "disk_total": disk.total,
        "disk_used": disk.used,
    }


async def stt_metrics() -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.get(f"{settings.STT_URL}/metrics")
        res.raise_for_status()
        return res.json()
    except Exception:
        return None


async def sample():
    """Минутный замер (планировщик бота): ресурсы в историю и проверка порогов"""
    now = time.time()
    server = _server()
    stt = await stt_metrics()
    previous = json.loads(await async_redis.get("perf:last") or "null")
    await async_redis.set("perf:last", json.dumps({"t": now, "server": server, "stt": stt}), ex=600)

    point = {
        "t": round(now),
        "load": round(server["load"], 2),
        "mem": round(1 - server["memory_free"] / server["memory_total"], 3),
        "disk": round(server["disk_used"] / server["disk_total"], 3),
    }
    if previous:
        busy = server["cpu_busy"] - previous["server"]["cpu_busy"]
        total = server["cpu_total"] - previous["server"]["cpu_total"]
        point["cpu"] = round(busy / total, 3) if total > 0 else None
    if stt:
        point.update(stt_mem=stt["memory"], stt_queue=stt["queue"])
        last_stt = previous and previous.get("stt")
        # Перезапуск обнуляет счетчик CPU — такой замер пропускаем
        if last_stt and stt["cpu_usec"] >= last_stt["cpu_usec"]:
            point["stt_cpu"] = round((stt["cpu_usec"] - last_stt["cpu_usec"]) / 1e6 / (now - previous["t"]) / (stt["cpus"] or 1), 3)
    await async_redis.lpush(SAMPLES_KEY, json.dumps(point))
    await async_redis.ltrim(SAMPLES_KEY, 0, SAMPLES_KEEP - 1)

    await _check(server, stt, point)


async def _check(server: dict, stt: dict | None, point: dict):
    if stt is None:
        fails = await async_redis.incr("perf:stt-fails")
        await async_redis.expire("perf:stt-fails", 600)
        if fails >= STT_DOWN_MINUTES:
            await raise_alert("stt_down", "Диктовка не работает", f"Сервис распознавания не отвечает {fails} мин подряд.")
    else:
        await async_redis.delete("perf:stt-fails")
        if stt["memory_limit"] and stt["memory"] >= STT_MEMORY_SHARE * stt["memory_limit"]:
            await raise_alert(
                "stt_memory", "Диктовке не хватает памяти",
                f"Сервис распознавания занял {stt['memory'] / 2**20:.0f} из {stt['memory_limit'] / 2**20:.0f} МБ. "
                "При лимите контейнер перезапустится и прервет диктовки.",
            )
        if stt["queue"] >= STT_QUEUE:
            await raise_alert(
                "stt_queue", "Очередь на распознавание речи",
                f"Своей очереди ждут {stt['queue']} {_plural(stt['queue'], 'диктовка', 'диктовки', 'диктовок')}: "
                "каждая обрабатывается по одной, люди ждут дольше обычного.",
            )
        recent = [json.loads(p) for p in await async_redis.lrange(SAMPLES_KEY, 0, STT_CPU_MINUTES - 1)]
        if len(recent) == STT_CPU_MINUTES and all((p.get("stt_cpu") or 0) >= STT_CPU_SHARE for p in recent):
            await raise_alert(
                "stt_cpu", "Распознавание речи заняло процессор",
                f"Уже {STT_CPU_MINUTES} мин сервис распознавания занимает больше {STT_CPU_SHARE:.0%} всех ядер сервера.",
            )
    if server["memory_free"] < SERVER_MEMORY_FREE * server["memory_total"]:
        await raise_alert(
            "server_memory", "На сервере заканчивается память",
            f"Свободно {server['memory_free'] / 2**20:.0f} из {server['memory_total'] / 2**20:.0f} МБ.",
        )
    if point["disk"] >= SERVER_DISK_USED:
        await raise_alert("server_disk", "На сервере заканчивается диск", f"Занято {point['disk']:.0%} диска.")


def _peak(points: list[dict], key: str):
    values = [p[key] for p in points if p.get(key) is not None]
    return max(values) if values else None


def _avg(points: list[dict], key: str):
    values = [p[key] for p in points if p.get(key) is not None]
    return round(sum(values) / len(values), 3) if values else None


async def report(session, hours: int) -> dict:
    since = time.time() - hours * 3600
    points = [p for p in (json.loads(x) for x in await async_redis.lrange(SAMPLES_KEY, 0, min(hours * 60, SAMPLES_KEEP) - 1)) if p["t"] >= since]
    server = _server()
    stt = await stt_metrics()
    last = points[0] if points else {}

    dictation = (await session.execute(text("""
        SELECT count(*), count(DISTINCT user_id),
               count(*) FILTER (WHERE status = 'ok'), count(*) FILTER (WHERE status = 'empty'),
               count(*) FILTER (WHERE status = 'error'), count(*) FILTER (WHERE trial AND status = 'ok'),
               coalesce(sum(audio_seconds), 0),
               avg(wait_seconds + process_seconds),
               percentile_cont(0.95) WITHIN GROUP (ORDER BY wait_seconds + process_seconds),
               max(wait_seconds),
               avg(process_seconds / nullif(audio_seconds, 0)) FILTER (WHERE audio_seconds >= 5),
               avg(total_seconds)
        FROM dictation_logs WHERE created_at >= :since
    """), {"since": datetime.utcnow() - timedelta(hours=hours)})).one()
    db_size = (await session.execute(text("SELECT pg_database_size(current_database())"))).scalar()

    def num(value, digits=1):
        return round(float(value), digits) if value is not None else None

    return {
        "hours": hours,
        "samples": len(points),
        "server": {
            "cpus": server["cpus"],
            "load": round(server["load"], 2),
            "cpu": last.get("cpu"), "cpu_avg": _avg(points, "cpu"), "cpu_peak": _peak(points, "cpu"),
            "memory_total": server["memory_total"], "memory_free": server["memory_free"], "memory_peak": _peak(points, "mem"),
            "disk_total": server["disk_total"], "disk_used": server["disk_used"],
            "db_size": db_size,
        },
        "stt": {
            "up": stt is not None,
            "queue": stt and stt["queue"],
            "memory": stt and stt["memory"],
            "memory_limit": stt and stt["memory_limit"],
            "memory_peak": _peak(points, "stt_mem"),
            "cpu": last.get("stt_cpu"), "cpu_avg": _avg(points, "stt_cpu"), "cpu_peak": _peak(points, "stt_cpu"),
            "queue_peak": _peak(points, "stt_queue"),
            "uptime": stt and stt["uptime"],
        },
        "dictation": {
            "count": dictation[0], "users": dictation[1], "ok": dictation[2], "empty": dictation[3], "errors": dictation[4],
            "trials": dictation[5], "audio_minutes": num(dictation[6] / 60),
            "avg_seconds": num(dictation[7]), "p95_seconds": num(dictation[8]), "max_wait_seconds": num(dictation[9]),
            "ratio": num(dictation[10], 3), "avg_total_seconds": num(dictation[11]),
        },
        "api": await api_report(hours),
    }
