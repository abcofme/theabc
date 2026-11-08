"""Store the masked display label for the method linked by renewal consent."""

from alembic import op

revision = "x5y6z7a8b9c0"
down_revision = "w4x5y6z7a8b9"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE payments ADD COLUMN IF NOT EXISTS autorenew_method_label VARCHAR(100)")


def downgrade():
    op.drop_column("payments", "autorenew_method_label")
