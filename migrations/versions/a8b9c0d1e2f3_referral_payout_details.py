"""Store SBP details with each new referral withdrawal."""

from alembic import op

revision = "a8b9c0d1e2f3"
down_revision = "z7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE partner_withdrawals
        ADD COLUMN IF NOT EXISTS payout_phone VARCHAR(12),
        ADD COLUMN IF NOT EXISTS payout_bank VARCHAR(100)
    """)


def downgrade():
    op.drop_column("partner_withdrawals", "payout_bank")
    op.drop_column("partner_withdrawals", "payout_phone")
