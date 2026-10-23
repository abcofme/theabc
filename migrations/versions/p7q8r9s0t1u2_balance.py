"""balance instead of demo access, gender, diary reminders, balance top-ups

Revision ID: p7q8r9s0t1u2
Revises: n6o7p8q9r0s1
Create Date: 2026-10-23 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'p7q8r9s0t1u2'
down_revision = 'n6o7p8q9r0s1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('balance', sa.Integer(), server_default='0', nullable=False))
    op.add_column('users', sa.Column('gender', sa.String(length=20), nullable=True))
    op.add_column('users', sa.Column('diary_reminders', sa.Boolean(), server_default='true', nullable=False))
    op.add_column('payments', sa.Column('is_topup', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('payments', sa.Column('amount', sa.Integer(), nullable=True))

    # Демо-доступ на 7 дней заменён демо-балансом 100 ₽. Тем, у кого демо ещё шло, начисляем его вместо доступа;
    # новые пользователи получают его при первом открытии приложения (GET /api/profile)
    op.execute("""
        UPDATE users SET balance = balance + 100
        WHERE first_opened_at > timezone('utc', now()) - interval '7 days'
          AND (premium_until IS NULL OR premium_until < timezone('utc', now()))
    """)


def downgrade():
    op.drop_column('payments', 'amount')
    op.drop_column('payments', 'is_topup')
    op.drop_column('users', 'diary_reminders')
    op.drop_column('users', 'gender')
    op.drop_column('users', 'balance')
