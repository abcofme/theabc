"""balance in tokens instead of rubles

Revision ID: t1u2v3w4x5y6
Revises: s0t1u2v3w4x5
Create Date: 2026-10-31 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 't1u2v3w4x5y6'
down_revision = 's0t1u2v3w4x5'
branch_labels = None
depends_on = None

# Баланс теперь в токенах: 1 ₽ = 10 токенов (backend/pricing.py, TOKENS_PER_RUBLE). Число в миграции
# зафиксировано: если курс потом поменяется, уже начисленные балансы пересчитывать отдельно
TOKENS_PER_RUBLE = 10


def upgrade():
    op.execute(f"UPDATE users SET balance = balance * {TOKENS_PER_RUBLE}")


def downgrade():
    op.execute(f"UPDATE users SET balance = balance / {TOKENS_PER_RUBLE}")
