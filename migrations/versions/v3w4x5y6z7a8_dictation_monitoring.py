"""dictation log and admin alerts

Revision ID: v3w4x5y6z7a8
Revises: u2v3w4x5y6z7
Create Date: 2026-11-02 20:00:00.000000

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'v3w4x5y6z7a8'
down_revision = 'u2v3w4x5y6z7'
branch_labels = None
depends_on = None


def upgrade():
    # Таблицы при запуске уже мог создать create_all по моделям DictationLog и AdminAlert
    op.execute("""
        CREATE TABLE IF NOT EXISTS dictation_logs (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status VARCHAR(20) NOT NULL,
            trial BOOLEAN NOT NULL DEFAULT false,
            audio_seconds DOUBLE PRECISION,
            wait_seconds DOUBLE PRECISION,
            process_seconds DOUBLE PRECISION,
            total_seconds DOUBLE PRECISION,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', now()),
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', now())
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_dictation_logs_user_id ON dictation_logs (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_dictation_logs_created_at ON dictation_logs (created_at)")
    op.execute("""
        CREATE TABLE IF NOT EXISTS admin_alerts (
            id BIGSERIAL PRIMARY KEY,
            kind VARCHAR(50) NOT NULL,
            title VARCHAR(200) NOT NULL,
            text TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 1,
            last_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', now()),
            seen BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', now()),
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', now())
        )
    """)


def downgrade():
    op.drop_table('admin_alerts')
    op.drop_table('dictation_logs')
