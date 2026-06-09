import os

connect_path = r'C:\abc\theabc\backend\database\connect.py'
with open(connect_path, 'r', encoding='utf-8') as f:
    content = f.read()

new_content = content.replace(
    'await connection.run_sync(metadata.create_all)',
    'await connection.run_sync(metadata.create_all)\n        from sqlalchemy import text\n        await connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT"))'
)

with open(connect_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("connect.py patched")
