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
            
            print("Adding referral columns to users...")
            await conn.execute(text("""
                ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_balance_pending INTEGER DEFAULT 0;
            """))
            await conn.execute(text("""
                ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_balance_available INTEGER DEFAULT 0;
            """))
            print("Successfully updated users.")
            
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
            
            print("Creating progress_logs table...")
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS progress_logs (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    test_id BIGINT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
                    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
                    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
                );
            """))
            # Fix in case table was created without updated_at
            await conn.execute(text("""
                ALTER TABLE progress_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now();
            """))
            print("Successfully created progress_logs table.")
            
            print("Creating portrait_logs table...")
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS portrait_logs (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
                    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
                );
            """))
            # Fix in case table was created without updated_at
            await conn.execute(text("""
                ALTER TABLE portrait_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now();
            """))
            print("Successfully created portrait_logs table.")
        except Exception as e:
            print(f"Migration failed: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
