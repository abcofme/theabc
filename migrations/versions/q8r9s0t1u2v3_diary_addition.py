"""diary_addition

Revision ID: q8r9s0t1u2v3
Revises: p7q8r9s0t1u2
Create Date: 2026-10-30 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'q8r9s0t1u2v3'
down_revision = 'p7q8r9s0t1u2'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('diary_entries', sa.Column('addition', sa.Text(), nullable=True))

def downgrade():
    op.drop_column('diary_entries', 'addition')
