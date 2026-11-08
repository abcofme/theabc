"""Record app activity and keep historical statistics after content is removed."""

from alembic import op

revision = "y6z7a8b9c0d1"
down_revision = "x5y6z7a8b9c0"
branch_labels = None
depends_on = None


def upgrade():
    # При штатном запуске таблицы уже мог создать create_all.
    op.execute("""
        CREATE TABLE IF NOT EXISTS app_openings (
            day DATE NOT NULL,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            opened_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
            PRIMARY KEY (day, user_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_app_openings_opened_at ON app_openings (opened_at)")
    op.execute("""
        INSERT INTO app_openings (day, user_id, opened_at)
        SELECT (first_opened_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow')::date, id, first_opened_at
        FROM users WHERE first_opened_at IS NOT NULL
        ON CONFLICT (day, user_id) DO UPDATE SET opened_at = LEAST(app_openings.opened_at, EXCLUDED.opened_at)
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS content_logs (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            kind VARCHAR(32) NOT NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_content_logs_created_at ON content_logs (created_at)")
    op.execute("""
        INSERT INTO content_logs (user_id, kind, created_at, updated_at)
        SELECT user_id, 'diary_entry', created_at, created_at FROM diary_entries
        UNION ALL
        SELECT user_id, 'compatibility', created_at, created_at FROM compatibility_reports
        UNION ALL
        SELECT user_id, CASE
            WHEN title LIKE '%овторя%' THEN 'repeating_events'
            WHEN title LIKE '%ффективн%' THEN 'effective_reactions'
            WHEN title LIKE '%нерги%' THEN 'energy'
            WHEN title LIKE '%омпетентн%' THEN 'competence'
            ELSE 'other'
        END, created_at, created_at FROM behavioral_reports
    """)

    # Старый код записывал created_at объекта и updated_at лога одним now() в общей транзакции.
    # Так можно отличить уже учтённое событие от более позднего повторного прохождения или генерации.
    op.execute("""
        INSERT INTO progress_logs (user_id, test_id, created_at, updated_at)
        SELECT DISTINCT p.user_id, p.test_id, p.created_at, p.created_at FROM progresses p
        WHERE (p.value IS NOT NULL OR p.hardcode_value IS NOT NULL)
          AND NOT EXISTS (
              SELECT 1 FROM progress_logs l WHERE l.user_id = p.user_id AND l.test_id = p.test_id
              AND p.created_at IN (l.created_at, l.updated_at)
          )
    """)
    op.execute("""
        INSERT INTO portrait_logs (user_id, created_at, updated_at)
        SELECT DISTINCT p.user_id, p.created_at, p.created_at FROM personality_portraits p
        WHERE NOT EXISTS (
            SELECT 1 FROM portrait_logs l WHERE l.user_id = p.user_id
            AND p.created_at IN (l.created_at, l.updated_at)
        )
    """)
    # Старый обработчик бота назначал progresses.id вручную.
    op.execute("""
        SELECT setval(pg_get_serial_sequence('progresses', 'id'),
                      GREATEST((SELECT MAX(id) FROM progresses), nextval(pg_get_serial_sequence('progresses', 'id'))))
    """)


def downgrade():
    op.drop_table("content_logs")
    op.drop_table("app_openings")
