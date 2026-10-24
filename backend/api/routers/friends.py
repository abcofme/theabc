import asyncio
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.common import AI_MODEL, ai_endpoint, avatar_url, get_session, run_in_background
from backend.api.security import validate_twa_data
from backend.billing import charge, refund
from backend.database import async_session
from backend.database.models import User, Friendship, PersonalityPortrait, CompatibilityReport
from backend.friends import friend_invite_link
from settings import settings

router = APIRouter()


# Друзья добавляются по личной ссылке-приглашению (см. backend/friends.py); заявки — от прежнего поиска по нику
@router.get("/api/friends")
async def get_friends(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    me = await session.get(User, user_id)

    # Check if current user has portrait
    current_user_portrait = (await session.execute(select(PersonalityPortrait).where(PersonalityPortrait.user_id == user_id))).scalars().first()
    current_user_has_portrait = bool(current_user_portrait)
    
    # Get all friendships where user is involved
    query = select(Friendship).where(
        or_(Friendship.user_id == user_id, Friendship.friend_id == user_id)
    )
    friendships = (await session.execute(query)).scalars().all()
    
    friends = []
    incoming_requests = []
    outgoing_requests = []
    
    for f in friendships:
        if f.status == "accepted":
            other_id = f.friend_id if f.user_id == user_id else f.user_id
            other_user = await session.get(User, other_id)
            if other_user:
                # Check if other user has portrait
                other_portrait = (await session.execute(select(PersonalityPortrait).where(PersonalityPortrait.user_id == other_id))).scalars().first()
                has_portrait = bool(other_portrait)
                
                # Check if compatibility exists between these two
                compat_query = select(CompatibilityReport).where(
                    or_(
                        and_(CompatibilityReport.user_id == user_id, CompatibilityReport.friend_id == other_id),
                        and_(CompatibilityReport.user_id == other_id, CompatibilityReport.friend_id == user_id)
                    )
                )
                compat = (await session.execute(compat_query)).scalars().first()
                has_compatibility = bool(compat)

                # Пол друга: как он указал сам, иначе — как его указали в прошлом анализе совместимости
                gender = other_user.gender
                if not gender and compat:
                    gender = compat.friend_gender if compat.user_id == user_id else compat.my_gender

                friends.append({
                    "id": other_user.id,
                    "friendship_id": f.id,
                    "username": other_user.username,
                    "first_name": other_user.tg_first_name,
                    "photo_url": avatar_url(other_user),
                    "has_portrait": has_portrait,
                    "has_compatibility": has_compatibility,
                    "gender": gender,
                })
        elif f.status == "pending":
            if f.friend_id == user_id:
                # incoming request
                other_user = await session.get(User, f.user_id)
                if other_user:
                    incoming_requests.append({
                        "id": other_user.id,
                        "request_id": f.id,
                        "username": other_user.username,
                        "first_name": other_user.tg_first_name,
                        "photo_url": avatar_url(other_user)
                    })
            else:
                # outgoing request
                other_user = await session.get(User, f.friend_id)
                if other_user:
                    outgoing_requests.append({
                        "id": other_user.id,
                        "request_id": f.id,
                        "username": other_user.username,
                        "first_name": other_user.tg_first_name,
                        "photo_url": avatar_url(other_user)
                    })
                
    return {
        "friends": friends,
        "incoming_requests": incoming_requests,
        "outgoing_requests": outgoing_requests,
        "current_user_has_portrait": current_user_has_portrait,
        "my_gender": me.gender if me else None,
        "invite_link": friend_invite_link(settings.BOT_LINK, user_id),
    }


@router.post("/api/friends/accept/{request_id}")
async def accept_friend_request(
    request_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    f = await session.get(Friendship, request_id)
    if not f or f.friend_id != user_id or f.status != "pending":
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid request")
        
    f.status = "accepted"
    await session.commit()
    return {"status": "success"}

@router.post("/api/friends/reject/{request_id}")
async def reject_friend_request(
    request_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    f = await session.get(Friendship, request_id)
    if not f:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not found")
        
    if f.friend_id != user_id and f.user_id != user_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
        
    await session.delete(f)
    await session.commit()
    return {"status": "success"}

@router.delete("/api/friends/{friend_id}")
async def delete_friend(
    friend_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    
    query = select(Friendship).where(
        and_(
            Friendship.status == "accepted",
            or_(
                and_(Friendship.user_id == user_id, Friendship.friend_id == friend_id),
                and_(Friendship.user_id == friend_id, Friendship.friend_id == user_id)
            )
        )
    )
    f = (await session.execute(query)).scalars().first()
    if not f:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Friendship not found")
        
    await session.delete(f)
    await session.commit()
    return {"status": "success"}


class CompatibilityRequest(BaseModel):
    friend_id: int
    type: str
    # Пол нужен только партнёрской совместимости
    my_gender: str = ""
    friend_gender: str = ""


# Промпты совместимости — в отдельных файлах, чтобы их можно было менять, не трогая код
_PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"
COMPATIBILITY_PROMPTS = {
    "friendly": (_PROMPTS_DIR / "compatibility_friendly.txt").read_text(encoding="utf-8").strip(),
    "partner": (_PROMPTS_DIR / "compatibility_partner.txt").read_text(encoding="utf-8").strip(),
}

# Формат зависит от того, как FriendPage показывает текст (ResultContent с глиняными заголовками),
# поэтому он живёт в коде, а не в файлах промптов
COMPATIBILITY_OUTPUT_FORMAT = """ФОРМАТ ОТВЕТА (обязателен: текст показывает приложение)

Выводи только текст для людей в Markdown. Без названия отчёта, без фраз вроде «Вот анализ» и без заключения после четвёртого блока.

Начни со вступления — два-три предложения без заголовка.

Дальше ровно четыре раздела. Каждый начинается с заголовка второго уровня, слово в слово:
## В чём вы дополняете друг друга
## К чему нужно быть терпеливыми
## Возможные общие цели
## Как восстанавливать отношения

Не нумеруй заголовки и не добавляй других заголовков: номера и оформление разделов приложение ставит само. В заголовках нет имён.

Первый абзац раздела — его главная мысль, одно-два предложения.

Дальше в первых трёх разделах — два-три подписанных абзаца, каждый с новой строки в формате **Подпись** — Текст. Подпись — одно-три слова кириллицей, без имён и без двоеточия, например **Мышление**, **Частота встреч**, **Совместное дело**. Приложение превращает подпись в заголовок карточки, поэтому текст после тире — одно-три самостоятельных предложения, первое начинается с заглавной буквы. Во втором разделе после подписанных абзацев идёт завершающая фраза обычным абзацем.

В разделе «Как восстанавливать отношения» после первого абзаца — ровно два подписанных абзаца, по одному на каждого человека, подпись — его имя: **Имя** — Текст.

Между заголовками и абзацами — пустая строка. Без списков, таблиц, цитат, эмодзи и декоративных символов. Внутри текста жирным можно выделить только короткий фрагмент, не целое предложение."""


# Модель сначала рассуждает, и рассуждения входят в лимит ответа. Агент по умолчанию даёт 4096 токенов —
# их целиком съедали рассуждения, и текст отчёта оставался пустым (finish_reason=length)
COMPATIBILITY_MAX_TOKENS = 16000


async def _generate_compatibility_bg(user_id: int, friend_id: int, compat_type: str, my_gender: str, friend_gender: str, messages: list, ai_url: str, ai_token: str, charged: int):
    result = await _generate_compatibility(user_id, friend_id, compat_type, my_gender, friend_gender, messages, ai_url, ai_token)
    if result["status"] != "success":
        await refund(user_id, charged)
    return result


async def _generate_compatibility(user_id: int, friend_id: int, compat_type: str, my_gender: str, friend_gender: str, messages: list, ai_url: str, ai_token: str) -> dict:
    import httpx
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            ai_response = await client.post(
                ai_url,
                headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                json={
                    "model": AI_MODEL,
                    "max_tokens": COMPATIBILITY_MAX_TOKENS,
                    "messages": messages
                }
            )
            if ai_response.status_code == 404:
                ai_response = await client.post(
                    ai_url,
                    headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                    json={
                        "model": AI_MODEL,
                        "max_tokens": COMPATIBILITY_MAX_TOKENS,
                        "messages": messages
                    }
                )
                
            if ai_response.status_code != 200:
                return {"status": "error", "message": "AI service error"}
                
            ai_data = ai_response.json()
            choice = (ai_data.get("choices") or [{}])[0]
            content = ((choice.get("message") or {}).get("content") or "").strip()
            print(f"AI compatibility {user_id}->{friend_id}: len={len(content)}, finish_reason={choice.get('finish_reason')}")
            # Отчёт совместимости — несколько тысяч знаков. Пустой или короткий ответ — сбой агента,
            # а не отчёт: не сохраняем его поверх прежнего, иначе на странице друга снова окажется форма
            if len(content) < 200:
                print(f"AI compatibility bad response: {ai_response.text[:500]}")
                return {"status": "error", "message": "ИИ не смог составить анализ совместимости. Попробуйте еще раз."}
        
        # Check if exists
        async with async_session() as db_session:
            existing = (await db_session.execute(select(CompatibilityReport).where(
                or_(
                    and_(CompatibilityReport.user_id == user_id, CompatibilityReport.friend_id == friend_id),
                    and_(CompatibilityReport.user_id == friend_id, CompatibilityReport.friend_id == user_id)
                )
            ))).scalars().first()
            
            if existing:
                existing.content = content
                existing.compat_type = compat_type
                existing.my_gender = my_gender
                existing.friend_gender = friend_gender
                await db_session.commit()
            else:
                new_report = CompatibilityReport(
                    user_id=user_id,
                    friend_id=friend_id,
                    compat_type=compat_type,
                    my_gender=my_gender,
                    friend_gender=friend_gender,
                    content=content
                )
                db_session.add(new_report)
                await db_session.commit()
                
        return {"status": "success", "content": content}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": f"Ошибка генерации совместимости: {repr(e)}"}

@router.post("/api/friends/compatibility")
async def generate_compatibility(
    req: CompatibilityRequest,
    user_data: dict = Depends(validate_twa_data),
    db: AsyncSession = Depends(get_session)
):
    try:
        from fastapi.responses import StreamingResponse
        user_id = user_data.get("id")
        friend_id = req.friend_id
        if req.type == "partner" and not (req.my_gender and req.friend_gender):
            raise HTTPException(status_code=400, detail="Укажите пол обоих пользователей")
        
        # Get portraits
        my_portrait = (await db.execute(select(PersonalityPortrait).where(PersonalityPortrait.user_id == user_id))).scalars().first()
        friend_portrait = (await db.execute(select(PersonalityPortrait).where(PersonalityPortrait.user_id == friend_id))).scalars().first()
        
        if not my_portrait or not friend_portrait:
            raise HTTPException(status_code=400, detail="Оба пользователя должны иметь портрет личности для анализа.")
            
        # Имена из Telegram-профилей — вместо обезличенных «А» и «Б». В тексте удобнее одно имя,
        # полное — только если имена совпали
        def _display_name(u, fallback, full=False):
            if not u:
                return fallback
            parts = (u.tg_first_name, u.tg_last_name) if full else (u.tg_first_name,)
            name = " ".join(x for x in parts if x).strip()
            return name or (f"@{u.username}" if u.username else fallback)

        me = await db.get(User, user_id)
        friend = await db.get(User, friend_id)
        name_a = _display_name(me, user_data.get("first_name") or "Пользователь 1")
        name_b = _display_name(friend, "Пользователь 2")
        if name_a == name_b:
            name_a = _display_name(me, name_a, full=True)
            name_b = _display_name(friend, name_b, full=True)
        if name_a == name_b:
            name_a, name_b = f"{name_a} (1)", f"{name_b} (2)"

        # Свой пол спрашиваем один раз — дальше приложение подставляет его само
        if req.my_gender and me and me.gender != req.my_gender:
            me.gender = req.my_gender
            await db.commit()

        if req.type not in COMPATIBILITY_PROMPTS:
            raise HTTPException(status_code=400, detail="Неизвестный тип совместимости")

        # Дружеской пол не нужен, но если он известен, модель согласует по нему род, а не угадывает по имени
        def _gender_line(gender):
            return gender.lower() if gender else "не указан — строй фразы без рода"

        def _portrait_text(portrait):
            text = portrait.content or ""
            return text[:20000] + "\n[портрет обрезан]" if len(text) > 20000 else text

        my_gender = req.my_gender or (me.gender if me else "")
        friend_gender = req.friend_gender or (friend.gender if friend else "")
        user_message = (
            f"Первый человек: {name_a}\n"
            f"Пол: {_gender_line(my_gender)}\n\n"
            f"Второй человек: {name_b}\n"
            f"Пол: {_gender_line(friend_gender)}\n\n"
            f"Портрет личности — {name_a}:\n\n{_portrait_text(my_portrait)}\n\n"
            f"Портрет личности — {name_b}:\n\n{_portrait_text(friend_portrait)}"
        )
        messages = [
            {"role": "system", "content": COMPATIBILITY_PROMPTS[req.type] + "\n\n" + COMPATIBILITY_OUTPUT_FORMAT},
            {"role": "user", "content": user_message},
        ]

        ai_url, ai_token = ai_endpoint()
        if not ai_url or not ai_token:
            raise HTTPException(status_code=500, detail="AI сервис не настроен")

        charged = await charge(db, user_id, "compatibility")
        task = run_in_background(_generate_compatibility_bg(user_id, friend_id, req.type, req.my_gender, req.friend_gender, messages, ai_url, ai_token, charged))
        
        async def stream_generator():
            try:
                while not task.done():
                    yield b" "
                    await asyncio.sleep(3)
                    
                result = task.result()
                if result.get("status") == "success":
                    import json
                    yield json.dumps(result).encode("utf-8")
                else:
                    import json
                    yield json.dumps({"detail": result.get("message", "Unknown error")}).encode("utf-8")
            except Exception as e:
                import traceback
                traceback.print_exc()
                import json
                yield json.dumps({"detail": f"Ошибка генерации совместимости: {repr(e)}"}).encode("utf-8")

        return StreamingResponse(stream_generator(), media_type="application/json", headers={"X-Accel-Buffering": "no"})
    except HTTPException:
        raise
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Внутренняя ошибка API: {repr(exc)}")

@router.get("/api/friends/compatibility/{friend_id}")
async def get_compatibility(
    friend_id: int,
    user_data: dict = Depends(validate_twa_data),
    db: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    report = (await db.execute(select(CompatibilityReport).where(
        or_(
            and_(CompatibilityReport.user_id == user_id, CompatibilityReport.friend_id == friend_id),
            and_(CompatibilityReport.user_id == friend_id, CompatibilityReport.friend_id == user_id)
        )
    ))).scalars().first()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
        
    return {"status": "success", "content": report.content}

