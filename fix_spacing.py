import os
import re

filepath = r'C:\abc\theabc\diary\src\features\profile\ProfileTab.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove handleClearPortrait button
content = re.sub(
    r'\{\s*portraitData\s*&&\s*\(\s*<button\s+onClick=\{handleClearPortrait\}[^>]*>\s*<Trash2[^>]*/>.*?</button>\s*\)\s*\}',
    '',
    content,
    flags=re.DOTALL
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
