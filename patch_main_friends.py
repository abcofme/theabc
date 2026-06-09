import os

main_py_path = r'C:\abc\theabc\backend\api\main.py'
with open(main_py_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Import Friendship
if 'Friendship' not in content:
    content = content.replace(
        'PersonalityPortrait, BehavioralReport',
        'PersonalityPortrait, BehavioralReport, Friendship'
    )

# 2. Update get_profile to save photo_url
profile_update_code = """
    # Update photo_url if present
    photo_url = user_data.get("photo_url")
    if photo_url:
        db_user = await session.get(User, user_id)
        if db_user and db_user.photo_url != photo_url:
            db_user.photo_url = photo_url
            await session.commit()
"""
if 'photo_url = user_data.get("photo_url")' not in content:
    idx = content.find('user_id = user_data.get("id")')
    if idx != -1:
        end_idx = content.find('\n', idx)
        content = content[:end_idx+1] + profile_update_code + content[end_idx+1:]

# 3. Add new endpoints for friends
friends_endpoints = """
from sqlalchemy import or_, and_

@app.get("/api/users/search")
async def search_users(
    q: str,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    if not q or len(q) < 2:
        return []
    
    # Search by username, excluding self
    query = select(User).where(
        User.id != user_id,
        User.username.ilike(f"%{q}%")
    ).limit(20)
    
    users = (await session.execute(query)).scalars().all()
    
    result = []
    for u in users:
        result.append({
            "id": u.id,
            "username": u.username,
            "first_name": u.tg_first_name,
            "photo_url": u.photo_url
        })
    return result

@app.get("/api/friends")
async def get_friends(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    
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
                friends.append({
                    "id": other_user.id,
                    "friendship_id": f.id,
                    "username": other_user.username,
                    "first_name": other_user.tg_first_name,
                    "photo_url": other_user.photo_url
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
                        "photo_url": other_user.photo_url
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
                        "photo_url": other_user.photo_url
                    })
                
    return {
        "friends": friends,
        "incoming_requests": incoming_requests,
        "outgoing_requests": outgoing_requests
    }

@app.post("/api/friends/request/{target_id}")
async def send_friend_request(
    target_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    user_id = user_data.get("id")
    if user_id == target_id:
        return {"status": "error", "message": "Cannot add yourself"}
        
    target_user = await session.get(User, target_id)
    if not target_user:
        return {"status": "error", "message": "User not found"}
        
    # Check if exists
    query = select(Friendship).where(
        or_(
            and_(Friendship.user_id == user_id, Friendship.friend_id == target_id),
            and_(Friendship.user_id == target_id, Friendship.friend_id == user_id)
        )
    )
    existing = (await session.execute(query)).scalars().first()
    if existing:
        return {"status": "error", "message": "Request or friendship already exists"}
        
    new_f = Friendship(user_id=user_id, friend_id=target_id, status="pending")
    session.add(new_f)
    await session.commit()
    return {"status": "success"}

@app.post("/api/friends/accept/{request_id}")
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

@app.post("/api/friends/reject/{request_id}")
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

@app.delete("/api/friends/{friend_id}")
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
"""

if 'def get_friends' not in content:
    content += "\n" + friends_endpoints

with open(main_py_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("main.py updated successfully.")
