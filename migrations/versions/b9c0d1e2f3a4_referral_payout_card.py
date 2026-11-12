"""Add encrypted card numbers and the last four digits to referral withdrawals."""

from alembic import op

revision = "b9c0d1e2f3a4"
down_revision = "a8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE partner_withdrawals
        ADD COLUMN IF NOT EXISTS payout_card_encrypted TEXT,
        ADD COLUMN IF NOT EXISTS payout_card_last4 VARCHAR(4)
    """)


def downgrade():
    op.drop_column("partner_withdrawals", "payout_card_last4")
    op.drop_column("partner_withdrawals", "payout_card_encrypted")
