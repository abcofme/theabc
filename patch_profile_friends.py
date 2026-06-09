import os

profile_path = r'C:\abc\theabc\diary\src\features\profile\ProfileTab.jsx'
with open(profile_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add Users to imports
if 'Users' not in content[:300]:
    content = content.replace(
        "from 'lucide-react';",
        ", Users } from 'lucide-react';"
    )

# 2. Add FriendsView import
if 'FriendsView' not in content:
    content = content.replace(
        "import AdminPanel from '../admin/AdminPanel';",
        "import AdminPanel from '../admin/AdminPanel';\nimport FriendsView from './FriendsView';"
    )

# 3. Add Friends button below Portrait button
friends_btn = """
                <button 
                  onClick={() => setActiveSubTab('friends')}
                  className="w-full bg-gradient-to-r from-blue-900/60 to-blue-800/30 rounded-2xl p-4 text-left hover:bg-blue-800/50 transition-all duration-700 active:scale-[0.98] flex items-center justify-between mt-3"
                >
                  <div>
                    <h3 className="text-lg font-bold text-blue-400 mb-1">Друзья</h3>
                    <p className="text-sm text-blue-200">Узнайте совместимость с вашим другом или партнером!</p>
                  </div>
                  <Users className="text-blue-400" size={24} />
                </button>
"""

if 'setActiveSubTab(\'friends\')' not in content:
    content = content.replace(
        '                  <ClipboardList className="text-green-500" size={24} />\n                </button>',
        '                  <ClipboardList className="text-green-500" size={24} />\n                </button>' + friends_btn
    )

# 4. Render FriendsView when activeSubTab === 'friends'
friends_view_render = """
      {activeSubTab === 'friends' && (
        <FriendsView onBack={() => setActiveSubTab('tests')} />
      )}
"""

if 'activeSubTab === \'friends\'' not in content:
    # insert before the closing root div
    idx = content.rfind('</div>\n  );\n}')
    content = content[:idx] + friends_view_render + content[idx:]

with open(profile_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("ProfileTab.jsx updated successfully.")
