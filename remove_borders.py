import os
import re

d = r'C:\abc\theabc\diary\src'
files = []
for root, _, fs in os.walk(d):
    for f in fs:
        if f.endswith('.jsx'):
            files.append(os.path.join(root, f))

p = re.compile(r'\s*\bborder(?:-[a-zA-Z0-9/#\[\]-]+)?\b')

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        lines = file.readlines()
        
    modified = False
    for i, line in enumerate(lines):
        if 'animate-spin' in line:
            continue
        new_line = p.sub('', line)
        if new_line != line:
            lines[i] = new_line
            modified = True
            
    if modified:
        with open(f, 'w', encoding='utf-8') as file:
            file.writelines(lines)
