import asyncio
from sqlalchemy import text
from backend.database import engine

async def main():
    async with engine.begin() as conn:
        try:
            await conn.execute(text('ALTER TABLE users ADD COLUMN tracking_link_id BIGINT;'))
        except Exception as e: print(e)
        try:
            await conn.execute(text('ALTER TABLE users ADD CONSTRAINT fk_trk FOREIGN KEY (tracking_link_id) REFERENCES tracking_links(id) ON DELETE SET NULL;'))
        except Exception as e: print(e)
        try:
            await conn.execute(text("UPDATE alembic_version SET version_num = 'k6l7m8n9p0q1';"))
        except Exception as e: print(e)

if __name__ == '__main__':
    asyncio.run(main())
