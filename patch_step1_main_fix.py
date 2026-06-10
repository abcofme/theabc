import os

main_path = r'C:\abc\theabc\backend\api\main.py'
# Revert the entire repository main.py to its clean state from git to be safe and try again
import subprocess
subprocess.run(['git', 'checkout', main_path], cwd=r'C:\abc\theabc')

with open(main_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update get_profile
if 'db_user.has_opened_app = True' not in content:
    content = content.replace(
        'if db_user and db_user.photo_url != photo_url:\n        db_user.photo_url = photo_url\n        await session.commit()',
        'if db_user:\n        changed = False\n        if db_user.photo_url != photo_url:\n            db_user.photo_url = photo_url\n            changed = True\n        if not db_user.has_opened_app:\n            db_user.has_opened_app = True\n            changed = True\n        if changed:\n            await session.commit()'
    )

# 2. search_users q.lstrip('@')
if "q = q.lstrip('@')" not in content:
    content = content.replace(
        'if not q or len(q) < 2:\n        return []',
        'q = q.lstrip(\'@\')\n    if not q or len(q) < 2:\n        return []'
    )

# 3. get_admin_stats total_users and active_users
if '"total_users"' not in content:
    idx = content.find('def get_admin_stats')
    end_idx = content.find('return {', idx)
    content = content[:end_idx] + 'total_users = (await session.execute(select(func.count(User.id)))).scalar() or 0\n    active_users = (await session.execute(select(func.count(User.id)).where(User.has_opened_app == True))).scalar() or 0\n    ' + content[end_idx:]
    
    # Now replace the specific return
    content = content[:end_idx+200].replace('return {', 'return {\n        "total_users": total_users,\n        "active_users": active_users,') + content[end_idx+200:]

# 4. _generate_portrait_bg prompt update
append_str = "\n    prompt += '\\n\\nВАЖНО: В поле description напиши до 3 предложений пояснения, почему ты выбрал именно такое % соответствия на этой шкале.'\n"
idx2 = content.find('async def _generate_portrait_bg')
end_idx2 = content.find('try:', idx2)
if 'ВАЖНО: В поле description' not in content:
    content = content[:end_idx2] + append_str + content[end_idx2:]

with open(main_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("main.py patched safely")
