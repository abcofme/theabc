"""bonuses for the first steps in the app

Revision ID: u2v3w4x5y6z7
Revises: t1u2v3w4x5y6
Create Date: 2026-11-02 12:00:00.000000

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'u2v3w4x5y6z7'
down_revision = 't1u2v3w4x5y6'
branch_labels = None
depends_on = None

PORTRAIT_TESTS = """
    SELECT t.id FROM tests t JOIN categories c ON c.id = t.category_id WHERE c.name <> 'Профориентация'
"""

# Кто уже сделал каждый шаг до появления бонусов: запрос по виду бонуса возвращает id этих пользователей
DONE_BEFORE = {
    "first_test": "SELECT user_id FROM progresses UNION SELECT user_id FROM progress_logs",
    # Портрет строится только после всех тестов
    "all_tests": f"""
        SELECT user_id FROM progresses WHERE test_id IN ({PORTRAIT_TESTS})
        GROUP BY user_id HAVING count(DISTINCT test_id) >= (SELECT count(*) FROM ({PORTRAIT_TESTS}) portrait_tests)
        UNION SELECT user_id FROM personality_portraits
        UNION SELECT user_id FROM portrait_logs
    """,
    "portrait": "SELECT user_id FROM personality_portraits UNION SELECT user_id FROM portrait_logs",
    # Оценка -1 — разбора не было (дневник попросил дописать запись)
    "diary_answer": "SELECT user_id FROM diary_entries WHERE portrait_match_score >= 0",
    # Дни подряд: у дат одной серии разность с порядковым номером одинакова
    "diary_week": """
        SELECT user_id FROM (
            SELECT user_id, day - (row_number() OVER (PARTITION BY user_id ORDER BY day))::int AS series
            FROM (SELECT DISTINCT user_id, date AS day FROM diary_entries) days
        ) numbered
        GROUP BY user_id, series HAVING count(*) >= 7
    """,
    # Вид отчета — по названию, прежние названия тоже. Основа слова без первой буквы: ILIKE
    # сравняет регистр кириллицы не при любой локали базы
    "report_repeating_events": "SELECT user_id FROM behavioral_reports WHERE title LIKE '%овторя%'",
    "report_effective_reactions": "SELECT user_id FROM behavioral_reports WHERE title LIKE '%ффективн%'",
    "report_energy": "SELECT user_id FROM behavioral_reports WHERE title LIKE '%нерги%'",
    "report_competence": "SELECT user_id FROM behavioral_reports WHERE title LIKE '%омпетентн%'",
    "friend_invited": "SELECT user_id FROM friendships WHERE status = 'accepted'",
    "compatibility": "SELECT user_id FROM compatibility_reports",
}


def upgrade():
    # Таблицу при запуске уже мог создать create_all по модели Bonus
    op.execute("""
        CREATE TABLE IF NOT EXISTS bonuses (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            kind VARCHAR(50) NOT NULL,
            amount INTEGER NOT NULL DEFAULT 0,
            seen BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', now()),
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', now()),
            CONSTRAINT uq_bonuses_user_kind UNIQUE (user_id, kind)
        )
    """)
    # Бонусы — за первые шаги. Уже сделанные отмечаем без начисления и без сообщения в приложении
    for kind, query in DONE_BEFORE.items():
        op.execute(f"""
            INSERT INTO bonuses (user_id, kind, amount, seen, created_at, updated_at)
            SELECT DISTINCT done.user_id, '{kind}', 0, true, timezone('utc', now()), timezone('utc', now())
            FROM ({query}) done JOIN users ON users.id = done.user_id
            ON CONFLICT ON CONSTRAINT uq_bonuses_user_kind DO NOTHING
        """)


def downgrade():
    op.drop_table('bonuses')
