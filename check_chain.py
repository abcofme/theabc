import os
import re

revisions = {}
downs = set()

for f in os.listdir('migrations/versions'):
    if not f.endswith('.py'): continue
    path = os.path.join('migrations/versions', f)
    with open(path, 'r', encoding='utf-8') as file:
        content = file.read()
        rev_match = re.search(r"revision.*?['\"]([^'\"]+)['\"]", content)
        down_match = re.search(r"down_revision.*?['\"]([^'\"]+)['\"]", content)
        rev = rev_match.group(1) if rev_match else 'None'
        down = down_match.group(1) if down_match else 'None'
        revisions[rev] = down
        downs.add(down)

print("Heads:", set(revisions.keys()) - downs)
