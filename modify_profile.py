import os
import re

filepath = r'C:\abc\theabc\diary\src\features\profile\ProfileTab.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove h-full from root div
content = content.replace(
    '<div className="flex flex-col h-full relative select-none bg-transparent max-w-2xl mx-auto w-full">',
    '<div className="flex flex-col relative select-none bg-transparent max-w-2xl mx-auto w-full">'
)

# 2. Remove overflow-y-auto and flex-1 from 'tests' subtab list container
content = content.replace(
    '<div className="flex-1 overflow-y-auto px-2 pb-6 space-y-3 animate-in fade-in duration-700 flex flex-col">',
    '<div className="px-2 pb-6 space-y-3 animate-in fade-in duration-700 flex flex-col">'
)

# 3. Remove flex-1 overflow-y-auto and pb-24 from 'portrait' container
# Note: we previously added pt-6 pb-24, let's just make it a normal div
content = content.replace(
    '<div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-6 pb-24 animate-in fade-in slide-in-from-right-8 duration-500 flex flex-col">',
    '<div className="px-4 sm:px-6 pt-6 animate-in fade-in slide-in-from-right-8 duration-500 flex flex-col">'
)
content = content.replace(
    '<div className="flex-1 overflow-y-auto px-4 pb-0 animate-in fade-in slide-in-from-right-8 duration-500 flex flex-col">',
    '<div className="px-4 animate-in fade-in slide-in-from-right-8 duration-500 flex flex-col">'
)

# 4. Remove flex-1 from the portrait data wrapper if it exists
content = content.replace(
    '<div className="flex-1 flex flex-col">\n              {portraitData',
    '<div className="flex flex-col">\n              {portraitData'
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
