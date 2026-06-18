"""is_read_reports

Revision ID: n6o7p8q9r0s1
Revises: m5n6o7p8q9r0
Create Date: 2026-06-18 00:50:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'n6o7p8q9r0s1'
down_revision = 'm5n6o7p8q9r0'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('behavioral_reports', sa.Column('is_read', sa.Boolean(), server_default='true', nullable=False))

def downgrade():
    op.drop_column('behavioral_reports', 'is_read')
