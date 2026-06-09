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
    # Add photo_url to users safely
    op.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT')
    
    # Create friendships table safely
    op.execute('''
        CREATE TABLE IF NOT EXISTS friendships (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            friend_id BIGINT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT fk_friendships_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_friendships_friend_id FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')

def downgrade() -> None:
    op.drop_table('friendships')
    op.drop_column('users', 'photo_url')
