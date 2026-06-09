"""friends

Revision ID: f1a2b3c4d5e6
Revises: 0af81bff4115_payment_fix
Create Date: 2026-06-09 20:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'f1a2b3c4d5e6'
down_revision = '0af81bff4115'  # Replace with the actual last revision if needed, but I saw 0af81bff4115_payment_fix.py
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Add photo_url to users
    op.add_column('users', sa.Column('photo_url', sa.Text(), nullable=True))
    
    # Create friendships table
    op.create_table('friendships',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('friend_id', sa.BigInteger(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['friend_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('id')
    )

def downgrade() -> None:
    op.drop_table('friendships')
    op.drop_column('users', 'photo_url')
