import asyncio
from sqlalchemy import text
from backend.database import engine

async def migrate():
    async with engine.begin() as conn:
        print("Adding portrait_match_score column to diary_entries table...")
        try:
            await conn.execute(text("ALTER TABLE diary_entries ADD COLUMN portrait_match_score INTEGER;"))
            print("Successfully added portrait_match_score column.")
        except Exception as e:
            print(f"Migration failed (it might already exist): {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
