import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from backend.database import engine

async def migrate():
    async with engine.begin() as conn:
        print("Creating behavioral_reports table...")
        try:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS behavioral_reports (
                    id BIGSERIAL PRIMARY KEY,
                    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
                    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    title VARCHAR(255) NOT NULL,
                    period_start DATE,
                    period_end DATE,
                    content TEXT NOT NULL
                );
            """))
            print("Successfully created behavioral_reports table.")
            
            print("Adding technical_summary to personality_portraits...")
            await conn.execute(text("""
                ALTER TABLE personality_portraits ADD COLUMN IF NOT EXISTS technical_summary TEXT;
            """))
            print("Successfully updated personality_portraits.")
            
            print("Adding portrait_match_explanation to diary_entries...")
            await conn.execute(text("""
                ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS portrait_match_explanation TEXT;
            """))
            print("Successfully updated diary_entries.")
        except Exception as e:
            print(f"Migration failed: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
