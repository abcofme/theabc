"""Track consent, renewal reminders and attempts.

Revision ID: w4x5y6z7a8b9
Revises: v3w4x5y6z7a8
"""
from alembic import op

revision = "w4x5y6z7a8b9"
down_revision = "v3w4x5y6z7a8"
branch_labels = None
depends_on = None

USER_COLUMNS = {
    "autorenew_consent_payment_id": "BIGINT",
    "autorenew_disabled_at": "TIMESTAMP",
    "autorenew_reminded_for": "TIMESTAMP",
    "autorenew_reminded_at": "TIMESTAMP",
}
PAYMENT_COLUMNS = {
    "autorenew_consent_at": "TIMESTAMP",
    "autorenew_terms_version": "VARCHAR(32)",
    "premium_period_days": "INTEGER",
    "renewal_due_at": "TIMESTAMP",
    "renewal_key": "VARCHAR(36)",
    "renewal_method_id": "VARCHAR(100)",
    "renewal_started_at": "TIMESTAMP",
    "renewal_canceled_at": "TIMESTAMP",
}


def upgrade():
    for table, columns in (("users", USER_COLUMNS), ("payments", PAYMENT_COLUMNS)):
        for name, column_type in columns.items():
            op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {name} {column_type}")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS payments_renewal_key_key ON payments (renewal_key)")


def downgrade():
    # This name can also belong to a UNIQUE constraint on a fresh database.
    op.execute("ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_renewal_key_key")
    op.execute("DROP INDEX IF EXISTS payments_renewal_key_key")
    for table, columns in (("payments", PAYMENT_COLUMNS), ("users", USER_COLUMNS)):
        for name in columns:
            op.drop_column(table, name)
