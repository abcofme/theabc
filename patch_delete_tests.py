import os

# 1. Update backend main.py
main_py_path = r'C:\abc\theabc\backend\api\main.py'
with open(main_py_path, 'r', encoding='utf-8') as f:
    main_py_content = f.read()

delete_endpoint = """
@app.delete("/api/admin/tests/{test_id}")
async def delete_admin_test(
    test_id: int,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session)
):
    from fastapi import HTTPException
    username = user_data.get("username", "")
    if username not in ['ingenfrid', 'key_crp', 'fondlife']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    test = await session.get(Test, test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
        
    await session.delete(test)
    await session.commit()
    return {"status": "success"}
"""

if "delete_admin_test" not in main_py_content:
    with open(main_py_path, 'a', encoding='utf-8') as f:
        f.write("\n" + delete_endpoint + "\n")

# 2. Update AdminPanel.jsx
admin_jsx_path = r'C:\abc\theabc\diary\src\features\admin\AdminPanel.jsx'
with open(admin_jsx_path, 'r', encoding='utf-8') as f:
    admin_jsx_content = f.read()

# Replace imports
if "Trash2" not in admin_jsx_content:
    admin_jsx_content = admin_jsx_content.replace(
        "import { ChevronLeft, ChevronDown, ChevronUp, Users, Calendar, Brain, FileText, CheckCircle } from 'lucide-react';",
        "import { ChevronLeft, ChevronDown, ChevronUp, Users, Calendar, Brain, FileText, CheckCircle, Trash2 } from 'lucide-react';"
    )

# Replace states
if "const [openDeleteCategory, setOpenDeleteCategory] = useState(null);" not in admin_jsx_content:
    admin_jsx_content = admin_jsx_content.replace(
        "  const [openCategory, setOpenCategory] = useState(null);",
        "  const [openCategory, setOpenCategory] = useState(null);\n  const [openDeleteCategory, setOpenDeleteCategory] = useState(null);\n  const [isDeleting, setIsDeleting] = useState(false);"
    )

# Add handleDeleteTest function
handle_delete_func = """
  const handleDeleteTest = async (testId, testName) => {
    if (!window.confirm(`Вы уверены, что хотите удалить тест "${testName}"? Это навсегда удалит тест и все результаты пользователей.`)) {
      return;
    }
    
    setIsDeleting(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/tests/${testId}`, {
        method: 'DELETE',
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      });
      
      if (!response.ok) {
        throw new Error(`Ошибка ${response.status}: ${await response.text()}`);
      }
      
      WebApp.showAlert("Тест успешно удален");
      fetchStats();
    } catch (error) {
      console.error(error);
      WebApp.showAlert(error.message || "Ошибка при удалении теста");
    } finally {
      setIsDeleting(false);
    }
  };
"""

if "const handleDeleteTest" not in admin_jsx_content:
    admin_jsx_content = admin_jsx_content.replace(
        "  const toggleCategory = (id) => {",
        handle_delete_func + "\n  const toggleCategory = (id) => {"
    )

# Add the UI block
ui_block = """
          <h3 className="text-xl font-bold text-[#F5E6D3] mt-8 mb-2">Удаление тестов</h3>
          <div className="bg-rose-900/40 p-4 rounded-3xl border border-red-900/30">
            <p className="text-red-300 text-sm mb-4 font-medium px-2">Внимание: Удаление теста навсегда сотрет его из базы данных вместе со всеми результатами пользователей.</p>
            {stats.test_counts.map(cat => (
              <div key={`del-cat-${cat.id}`} className="bg-rose-900 rounded-2xl overflow-hidden shadow-sm transition-all duration-700 mb-3 last:mb-0">
                <button
                  onClick={() => setOpenDeleteCategory(openDeleteCategory === cat.id ? null : cat.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-rose-800/70 transition-colors active:bg-rose-800"
                >
                  <span className="font-semibold text-[#F5E6D3] text-left text-base sm:text-lg pr-4 leading-tight">
                    {cat.name}
                  </span>
                  {openDeleteCategory === cat.id ? (
                    <ChevronUp size={22} className="text-[#F5E6D3] shrink-0" />
                  ) : (
                    <ChevronDown size={22} className="text-[#F5E6D3] shrink-0" />
                  )}
                </button>

                {openDeleteCategory === cat.id && (
                  <div className="bg-rose-950/40 px-4 py-2">
                    {cat.tests.length === 0 ? (
                      <div className="text-[#F5E6D3] text-sm py-3 italic">В этой категории нет тестов.</div>
                    ) : (
                      cat.tests.map(test => (
                        <div key={`del-test-${test.id}`} className="flex items-center justify-between py-3.5 border-b border-rose-800/30 last:border-0">
                          <button 
                            onClick={() => handleDeleteTest(test.id, test.name)}
                            disabled={isDeleting}
                            className="p-2 mr-3 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Trash2 size={20} />
                          </button>
                          <span className="text-sm sm:text-base font-medium pr-3 text-[#F5E6D3] flex-1">
                            {test.name}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
"""

if "Удаление тестов" not in admin_jsx_content:
    admin_jsx_content = admin_jsx_content.replace(
        "        </div>\n      ) : null}",
        ui_block + "\n        </div>\n      ) : null}"
    )

with open(admin_jsx_path, 'w', encoding='utf-8') as f:
    f.write(admin_jsx_content)

print("Patch applied successfully.")
