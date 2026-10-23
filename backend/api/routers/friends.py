import asyncio

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

async def _generate_compatibility_bg(user_id: int, friend_id: int, compat_type: str, my_gender: str, friend_gender: str, prompt: str, ai_url: str, ai_token: str, charged: int):
    result = await _generate_compatibility(user_id, friend_id, compat_type, my_gender, friend_gender, prompt, ai_url, ai_token)
    if result["status"] != "success":
        await refund(user_id, charged)
    return result


async def _generate_compatibility(user_id: int, friend_id: int, compat_type: str, my_gender: str, friend_gender: str, prompt: str, ai_url: str, ai_token: str) -> dict:
    import httpx
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            ai_response = await client.post(
                ai_url,
                headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                json={
                    "model": AI_MODEL,
                    "messages": [{"role": "user", "content": prompt}]
                }
            )
            if ai_response.status_code == 404:
                ai_response = await client.post(
                    ai_url,
                    headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                    json={
                        "model": AI_MODEL,
                        "messages": [{"role": "user", "content": prompt}]
                    }
                )
                
            if ai_response.status_code != 200:
                return {"status": "error", "message": "AI service error"}
                
            ai_data = ai_response.json()
            content = ai_data["choices"][0]["message"]["content"].strip()
        
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
            
        # Имена из Telegram-профилей — вместо обезличенных «А» и «Б»
        def _display_name(u, fallback):
            if not u:
                return fallback
            name = " ".join(x for x in (u.tg_first_name, u.tg_last_name) if x).strip()
            return name or (f"@{u.username}" if u.username else fallback)

        me = await db.get(User, user_id)
        friend = await db.get(User, friend_id)
        name_a = _display_name(me, user_data.get("first_name") or "Пользователь 1")
        name_b = _display_name(friend, "Пользователь 2")
        if name_a == name_b:
            name_a, name_b = f"{name_a} (1)", f"{name_b} (2)"

        # Свой пол спрашиваем один раз — дальше приложение подставляет его само
        if req.my_gender and me and me.gender != req.my_gender:
            me.gender = req.my_gender
            await db.commit()

        if req.type == 'friendly':
            prompt = f"""Ты — система сравнения психологических профилей для дружеских отношений. Не используй слова «гармония», «идеально», «замечательно», «прекрасно», «удивительно». Не давай советов в духе «вам стоит», «попробуйте». Только констатация фактов на основе данных.

На вход подаются полные результаты тестов двух пользователей ({name_a} и {name_b}) по пяти категориям: темперамент, личность (акцентуации), самооценка, общительность (включая дружелюбие и доминирование), профориентация.

Твоя задача: на основе сравнения профилей выдать структурированный ответ из четырёх обязательных блоков. Каждый блок — не более 3–4 предложений, строго по делу, без лишних оценок.

При формировании блоков учитывай следующие аспекты (но не обязательно перечислять все, только те, для которых есть чёткие данные в профилях):

1. В чем вы друг друга дополняете — оцените, как каждый расширяет границы другого:
   - Интеллектуальный диссонанс (логическое vs творческое мышление, дают друг другу непривычную оптику).
   - Эмоциональные роли (один — «жилетка» (эмпат), другой — «адвокат» (даёт советы и решения); важно, могут ли они меняться ролями).
   - Социальные связи (непересекающиеся круги общения расширяют мир, но без требования дружить с ними).
   - Уровень активности (один заводит на активности, другой учит наслаждаться паузой).
   Формулируй как факт: «{name_a} расширяет {name_b} в [категория/черта], {name_b} расширяет {name_a} в [категория/черта]».

2. К каким несовместимостям нужно быть терпеливыми — выделите зоны, где различия приемлемы без попыток «исправить»:
   - Разная частота встреч и инициативность (один пишет часто, другой редко, но при встрече тепло).
   - Разные политические / религиозные взгляды (если нет агрессивных попыток переубедить).
   - Несовпадение в хобби и вкусах (не обязаны любить одно и то же).
   - Разный уровень открытости (один любит глубокие обсуждения, другой — поверхностные новости).
   Укажите, в каких ситуациях это может проявляться, и завершите фразой: «Эти различия требуют терпения, попытки переделать друга приведут к дистанции».

3. Возможные общие цели — определите ситуативные цели, которые могут объединять:
   - Взаимопомощь в сложных периодах (карьерный кризис, разрыв, болезнь) — готовность поддержать.
   - Совместные проекты (походы, путешествия, волонтёрство, бизнес-идеи) — то, что делаете вместе сейчас.
   - Личностный рост друг друга — поддержка выборов друга, даже если они неудобны.
   - Сохранение связи во времени — осознанное намерение не терять контакт при переездах и смене статуса.
   Будьте конкретны: например, «поддержка друга в смене профессии», «совместная поездка в горы», «ежегодные встречи несмотря на расстояния».

4. На что обращать внимание для восстановления отношений — после обид или охлаждения:
   - Уважение к паузе (не давить, не выяснять отношения через силу).
   - Искренний юмор и лёгкость (возврат к совместным шуткам и приятным воспоминаниям без драмы).
   - Отсутствие обид за «неидеальность» (принятие, что друг может забыть о дате, если в остальном надёжен).
   - Честность о своих границах (мягкий, но чёткий разговор, если друг перешёл черту).
   - Создание нового совместного опыта (спонтанное новое дело, чтобы «записать» поверх ссоры новый позитивный след).
   Укажите, что важно для каждого из друзей в отдельности.

Все выводы должны быть сухими, фактологическими, без оценки «лучше/хуже».

Профиль пользователя {name_a}:
{my_portrait.content}

Профиль пользователя {name_b}:
{friend_portrait.content}

Называй пользователей только по именам ({name_a} и {name_b}), не используй обозначения «А» и «Б». Используй красивое форматирование Markdown (заголовки, списки). Не используй никаких вступлений, сразу выдавай результат анализа. Сгенерируй ответ строго по четырём блокам."""
        else:
            prompt = f"""Ты — система сравнения психологических профилей для партнёрских отношений. Не используй слова «гармония», «идеально», «замечательно», «прекрасно», «удивительно». Не давай советов в духе «вам стоит», «попробуйте». Только констатация фактов на основе данных.

Пол пользователя {name_a}: {req.my_gender}
Пол пользователя {name_b}: {req.friend_gender}

На вход подаются полные результаты тестов двух пользователей ({name_a} и {name_b}) по пяти категориям: темперамент, личность (акцентуации), самооценка, общительность (включая дружелюбие и доминирование), профориентация.

Твоя задача: на основе сравнения профилей выдать структурированный ответ из четырёх обязательных блоков. Каждый блок — не более 3–4 предложений, строго по делу, без лишних оценок.

При формировании блоков учитывай следующие аспекты (но не обязательно перечислять все, только те, для которых есть чёткие данные в профилях):

1. В чем вы друг друга дополняете — оцените глубинные компенсации:
   - Эмоциональный баланс (кто паникует, кто сохраняет хладнокровие; кто помогает чувствовать живые эмоции, кто — не «зависать» в рацио).
   - Бытовая и финансовая компетенция (генератор идей / рисковый vs систематизатор / хранитель бюджета).
   - Социальная энергия (интроверт замедляет и рефлексирует, экстраверт вытаскивает в мир).
   - Сексуальный драйв (спонтанность и новизна vs глубина и эмоциональная связь).
   Формулируй как факт: «{name_a} компенсирует {name_b} в [категория/черта], {name_b} компенсирует {name_a} в [категория/черта]».

2. К каким несовместимостям нужно быть терпеливыми — выделите зоны, где различия могут вызывать трения, но их можно принимать без попыток переделать:
   - Разный уровень аккуратности / порядка (если не антисанитария).
   - Разная потребность в тактильности и личном пространстве.
   - Разный темп принятия решений.
   - Несовпадение либидо в отдельные фазы жизни (гормоны, стресс, возраст).
   Укажите конкретные ситуации вероятных конфликтов и завершите фразой: «Эти различия требуют терпения, попытки переделать партнёра приведут к напряжению».

3. Возможные общие цели — определите долгосрочные векторы, которые могут объединять:
   - Финансовая стратегия на 5+ лет (ипотека, инвестиции, уровень жизни, отношение к кредитам).
   - Модель семьи (дети, распределение родительства, отношение к вмешательству родственников).
   - География жизни (готовность к переездам ради карьеры).
   - Качество досуга в долгосроке (активная или спокойная старость, город или загород).
   Будьте конкретны, например: «совместное накопление на квартиру», «воспитание детей с акцентом на творчество», «переезд в другой город через 3 года».

4. На что обращать внимание для восстановления отношений — на основе темперамента и копинг-стратегий укажите механизмы перезагрузки:
   - Ритуал «точки сборки» (ежедневные 15 минут без гаджетов для обсуждения дня без претензий).
   - Скорость остывания и предпочтительный канал коммуникации после ссоры (письменная или устная).
   - Физический контакт как якорь (объятия, прикосновения).
   - Честность о своих «слепых зонах» (просьба дать время на остывание).
   - Совместное планирование приятного после примирения.
   Укажите, что важно для каждого из партнёров в отдельности.

Все выводы должны быть сухими, фактологическими, без оценки «лучше/хуже».

Профиль пользователя {name_a}:
{my_portrait.content}

Профиль пользователя {name_b}:
{friend_portrait.content}

Называй пользователей только по именам ({name_a} и {name_b}), не используй обозначения «А» и «Б». Используй красивое форматирование Markdown (заголовки, списки). Не используй никаких вступлений, сразу выдавай результат анализа. Сгенерируй ответ строго по четырём блокам."""

        ai_url, ai_token = ai_endpoint()
        if not ai_url or not ai_token:
            raise HTTPException(status_code=500, detail="AI сервис не настроен")

        charged = await charge(db, user_id, "compatibility")
        task = run_in_background(_generate_compatibility_bg(user_id, friend_id, req.type, req.my_gender, req.friend_gender, prompt, ai_url, ai_token, charged))
        
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

