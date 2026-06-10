import os
import re

main_path = r'C:\abc\theabc\backend\api\main.py'
with open(main_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update get_profile
if 'db_user.has_opened_app = True' not in content:
    content = content.replace(
        'if db_user and db_user.photo_url != photo_url:\n            db_user.photo_url = photo_url\n            await session.commit()',
        'if db_user:\n            changed = False\n            if db_user.photo_url != photo_url:\n                db_user.photo_url = photo_url\n                changed = True\n            if not db_user.has_opened_app:\n                db_user.has_opened_app = True\n                changed = True\n            if changed:\n                await session.commit()'
    )

# 2. search_users q.lstrip('@')
if "q = q.lstrip('@')" not in content:
    content = content.replace(
        'if not q or len(q) < 2:\n        return []',
        'q = q.lstrip(\'@\')\n    if not q or len(q) < 2:\n        return []'
    )

# 3. get_admin_stats total_users and active_users
if '"total_users"' not in content:
    stats_query_str = """
    # Stats logic
    total_users = (await session.execute(select(func.count(User.id)))).scalar() or 0
    active_users = (await session.execute(select(func.count(User.id)).where(User.has_opened_app == True))).scalar() or 0
"""
    if 'def get_admin_stats' in content:
        # We need to insert total_users and active_users
        idx = content.find('user_id = user_data.get("id")')
        end_idx = content.find('\n', idx)
        content = content[:end_idx+1] + stats_query_str + content[end_idx+1:]
        
        content = content.replace(
            'return {',
            'return {\n        "total_users": total_users,\n        "active_users": active_users,'
        )

# 4. _generate_portrait_bg prompt update
if 'В поле description напиши до 3 предложений пояснения' not in content:
    content = content.replace(
        'prompt: str, ai_url',
        'prompt: str, ai_url'
    )
    # We will just append to prompt variable inside the function
    idx = content.find('json={\n                    "model": "gpt-3.5-turbo",\n                    "messages": [{"role": "user", "content": prompt}]')
    if idx != -1:
        # Wait, the prompt is passed into the function. Better to modify the prompt inside the function:
        # prompt += '\nВАЖНО: В поле description напиши до 3 предложений пояснения, почему ты выбрал именно такое % соответствия на этой шкале.'
        append_str = "\n    prompt += '\\n\\nВАЖНО: В поле description напиши до 3 предложений пояснения, почему ты выбрал именно такое % соответствия на этой шкале.'\n"
        idx2 = content.find('async def _generate_portrait_bg')
        end_idx2 = content.find('try:', idx2)
        content = content[:end_idx2] + append_str + content[end_idx2:]

with open(main_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("main.py patched")
