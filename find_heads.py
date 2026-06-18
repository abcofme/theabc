import os
import re

versions_dir = r"c:\abc\theabc\migrations\versions"

# Map of revision -> down_revision
revs = {}
for filename in os.listdir(versions_dir):
    if not filename.endswith(".py"):
        continue
    filepath = os.path.join(versions_dir, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    rev_match = re.search(r"revision.*?['\"]([^'\"]+)['\"]", content)
    down_match = re.search(r"down_revision.*?['\"]([^'\"]+)['\"]", content)
    down_tuple_match = re.search(r"down_revision.*?=\s*\(([^)]+)\)", content)
    
    rev = rev_match.group(1) if rev_match else None
    
    if down_tuple_match:
        # e.g. ('0af81bff4115', '42a613ed7f5e')
        downs = re.findall(r"['\"]([^'\"]+)['\"]", down_tuple_match.group(1))
        revs[rev] = downs
    else:
        down = down_match.group(1) if down_match else None
        revs[rev] = [down] if down else []

all_downs = set()
for r, downs in revs.items():
    for d in downs:
        all_downs.add(d)

heads = [r for r in revs if r not in all_downs]
print("Heads:", heads)
