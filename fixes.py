import os

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Less transparent blocks
    content = content.replace('bg-rose-900/60', 'bg-rose-900/80')
    content = content.replace('bg-rose-950/30', 'bg-rose-950/50')
    content = content.replace('bg-rose-900/30 opacity-70', 'bg-rose-900/50 opacity-90')

    # 2. Portrait text block styling
    content = content.replace(
        'className="prose prose-invert max-w-none text-base sm:text-lg mb-8 leading-relaxed"',
        'className="prose prose-invert max-w-none text-base sm:text-lg mb-8 leading-relaxed bg-rose-900/80 rounded-3xl p-5 sm:p-6 shadow-sm"'
    )

    # 3. Titles color in ReportsTab
    if 'ReportsTab.jsx' in filepath:
        # The titles are currently:
        # <h2 className={`text-xl font-bold mb-2 leading-tight ${rType.color}`}>{rType.title}</h2>
        # <h3 className={`text-lg font-bold mb-2 leading-tight ${rtype.color}`}>{rtype.title}</h3>
        content = content.replace(
            'className={`text-xl font-bold mb-2 leading-tight ${rType.color}`}',
            'className="text-xl font-bold mb-2 leading-tight text-[#F5E6D3]"'
        )
        content = content.replace(
            'className={`text-lg font-bold mb-2 leading-tight ${rtype.color}`}',
            'className="text-lg font-bold mb-2 leading-tight text-[#F5E6D3]"'
        )
        
        # 4. Symbols to the "Admin button" green (which is blue-500/blue-600)
        content = content.replace("color: 'text-emerald-400'", "color: 'text-blue-500'")
        content = content.replace("bg: 'bg-emerald-500/10'", "bg: 'bg-blue-600/20'")
        
    # 5. Make Portrait buttons the same green as admin panel (which is blue)
    if 'ProfileTab.jsx' in filepath:
        # The portrait buttons currently use emerald
        content = content.replace('bg-emerald-900/60 hover:bg-emerald-800/80', 'bg-blue-600/80 hover:bg-blue-500/80')
        content = content.replace('bg-emerald-600 hover:bg-emerald-500', 'bg-blue-600 hover:bg-blue-500')
        content = content.replace('from-emerald-900/30 to-emerald-800/10', 'from-blue-600/40 to-blue-500/20')
        content = content.replace('shadow-emerald-900/20', 'shadow-blue-900/20')
        
    # App.jsx: image placement
    if 'App.jsx' in filepath:
        content = content.replace(
            'className="absolute inset-0 pointer-events-none z-0"',
            'className="absolute top-0 left-0 right-0 bottom-[75px] pointer-events-none z-0"'
        )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

for root, _, files in os.walk(r'C:\abc\theabc\diary\src'):
    for file in files:
        if file.endswith('.jsx'):
            process_file(os.path.join(root, file))
