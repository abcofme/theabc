import os

models_path = r'C:\abc\theabc\backend\database\models.py'
with open(models_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add photo_url to User
if 'photo_url: Mapped[' not in content:
    content = content.replace(
        '    username: Mapped[str] = mapped_column(String(32), nullable=True)',
        '    username: Mapped[str] = mapped_column(String(32), nullable=True)\n    photo_url: Mapped[str] = mapped_column(Text(), nullable=True)'
    )

# 2. Add Friendship model
friendship_model = """
class Friendship(BaseModel):
    __tablename__ = "friendships"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    friend_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # 'pending', 'accepted'
    
    # We won't add bidirectional relationships to User for now to keep it simple, 
    # we can query Friendship directly.
"""

if 'class Friendship' not in content:
    content += "\n" + friendship_model

with open(models_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("models.py updated successfully.")
