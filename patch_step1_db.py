import os

# 1. Update models.py
models_path = r'C:\abc\theabc\backend\database\models.py'
with open(models_path, 'r', encoding='utf-8') as f:
    content = f.read()

if 'has_opened_app: Mapped[' not in content:
    content = content.replace(
        'photo_url: Mapped[str] = mapped_column(Text(), nullable=True)',
        'photo_url: Mapped[str] = mapped_column(Text(), nullable=True)\n    has_opened_app: Mapped[bool] = mapped_column(Boolean, default=False)'
    )

with open(models_path, 'w', encoding='utf-8') as f:
    f.write(content)

# 2. Update connect.py
connect_path = r'C:\abc\theabc\backend\database\connect.py'
with open(connect_path, 'r', encoding='utf-8') as f:
    content = f.read()

if 'has_opened_app BOOLEAN DEFAULT FALSE' not in content:
    content = content.replace(
        'await connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT"))',
        'await connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT"))\n        await connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS has_opened_app BOOLEAN DEFAULT FALSE"))'
    )

with open(connect_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("DB models and connect updated")
