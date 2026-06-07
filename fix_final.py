import os
import re

# 1. Fix AdminPanel.jsx
admin_path = r'C:\abc\theabc\diary\src\features\admin\AdminPanel.jsx'
with open(admin_path, 'r', encoding='utf-8') as f:
    admin_content = f.read()

admin_content = admin_content.replace('bg-rose-900/80', 'bg-rose-900')

with open(admin_path, 'w', encoding='utf-8') as f:
    f.write(admin_content)


# 2. Fix ProfileTab.jsx (test names wrapping)
profile_path = r'C:\abc\theabc\diary\src\features\profile\ProfileTab.jsx'
with open(profile_path, 'r', encoding='utf-8') as f:
    profile_content = f.read()

profile_content = profile_content.replace(
    'className="text-sm sm:text-base font-medium pr-3 text-[#F5E6D3] flex-1 truncate"',
    'className="text-sm sm:text-base font-medium pr-3 text-[#F5E6D3] flex-1 leading-snug"'
)

with open(profile_path, 'w', encoding='utf-8') as f:
    f.write(profile_content)
