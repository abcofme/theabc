import asyncio
from sqlalchemy import text
from backend.database.engine import engine

async def migrate():
    async with engine.begin() as conn:
        print("Adding rating column to diary_entries table...")
        try:
            await conn.execute(text("ALTER TABLE diary_entries ADD COLUMN rating INTEGER;"))
            print("Successfully added rating column.")
        except Exception as e:
            print(f"Migration failed (it might already exist): {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
