import os
import re

mig_path = r'C:\abc\theabc\migrations\versions\f1a2b3c4d5e6_friends.py'
with open(mig_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Make it idempotent using raw SQL
new_upgrade = """def upgrade() -> None:
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
"""

if 'def upgrade' in content:
    content = re.sub(r'def upgrade\(\) -> None:.*?def downgrade', new_upgrade + '\ndef downgrade', content, flags=re.DOTALL)

# Fix down_revision
# Let's find the correct down_revision
import glob
heads = set()
downs = set()
for file in glob.glob(r'C:\abc\theabc\migrations\versions\*.py'):
    with open(file, 'r', encoding='utf-8') as f:
        file_content = f.read()
        m1 = re.search(r"revision\s*=\s*['\"]([^'\"]+)['\"]", file_content)
        m2 = re.search(r"down_revision\s*=\s*['\"]([^'\"]+)['\"]", file_content)
        if m1: heads.add(m1.group(1))
        if m2 and m2.group(1): downs.add(m2.group(1))

real_heads = heads - downs
# The real head should be one of them, but f1a2b3c4d5e6 is also in heads now.
real_heads.discard('f1a2b3c4d5e6')
if real_heads:
    true_down = list(real_heads)[0]
    content = re.sub(r"down_revision = '.*?'", f"down_revision = '{true_down}'", content)

with open(mig_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Migration fixed. Down revision set to: {real_heads}")
