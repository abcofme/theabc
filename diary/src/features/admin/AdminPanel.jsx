import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Users, Calendar, Brain, FileText, Check, Trash2, Edit, Plus, Heart, Link2, Download } from 'lucide-react';
import AdminTestEditor from './AdminTestEditor';
import ScreenState from '../../components/ScreenState';

const WebApp = window.Telegram.WebApp;
const API_URL = window.location.origin;

export default function AdminPanel() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isUnique, setIsUnique] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(false);
  const [linksError, setLinksError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openCategory, setOpenCategory] = useState(null);
  const [openReports, setOpenReports] = useState(false);
  const [openDeleteCategory, setOpenDeleteCategory] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingTestId, setEditingTestId] = useState(undefined); // null - create, number - edit, undefined - list
  
  const [grantTargetUsername, setGrantTargetUsername] = useState('');
  const [grantType, setGrantType] = useState('premium');
  const [isGranting, setIsGranting] = useState(false);
  const [revokeTargetUsername, setRevokeTargetUsername] = useState('');
  const [revokeType, setRevokeType] = useState('premium');
  const [isRevoking, setIsRevoking] = useState(false);
  const [trackingLinks, setTrackingLinks] = useState([]);
  const [newLinkName, setNewLinkName] = useState('');
  const [isLoadingLinks, setIsLoadingLinks] = useState(true);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [exportSelectedIds, setExportSelectedIds] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const [aiImportText, setAiImportText] = useState('');
  const [aiImportCategoryId, setAiImportCategoryId] = useState('');
  const [isAiImporting, setIsAiImporting] = useState(false);
  const [aiImportResult, setAiImportResult] = useState(null); // {test_name, questions_count, results_count} or error string
  const fetchTrackingLinks = useCallback(() => {
    if (!WebApp.initData) return Promise.resolve();
    return fetch(`${API_URL}/api/admin/tracking_links`, { headers: { Authorization: `Bearer ${WebApp.initData}` } })
      .then(async response => {
        if (!response.ok) throw new Error('Не удалось загрузить ссылки');
        setTrackingLinks(await response.json());
        setLinksError(false);
      })
      .catch(error => { setLinksError(true); console.error(error); })
      .finally(() => setIsLoadingLinks(false));
  }, []);

  const handleCreateLink = async () => {
    if (!newLinkName) return;
    setIsCreatingLink(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/tracking_links`, {
        method: 'POST',
        headers: {
          "Authorization": `Bearer ${WebApp.initData}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name: newLinkName })
      });
      if (response.ok) {
        setNewLinkName('');
        fetchTrackingLinks();
      } else {
        WebApp.showAlert("Ошибка при создании ссылки");
      }
    } catch (e) {
      console.error(e);
      WebApp.showAlert("Ошибка при создании ссылки");
    } finally {
      setIsCreatingLink(false);
    }
  };

  const handleDeleteLink = async (id) => {
    WebApp.showConfirm("Удалить эту ссылку?", async (confirmed) => {
      if (!confirmed) return;
      try {
        const response = await fetch(`${API_URL}/api/admin/tracking_links/${id}`, {
          method: 'DELETE',
          headers: { "Authorization": `Bearer ${WebApp.initData}` }
        });
        if (response.ok) {
          fetchTrackingLinks();
        }
      } catch (e) {
        console.error(e);
      }
    });
  };

  const fetchStats = useCallback(() => {
    if (!WebApp.initData) return Promise.resolve();
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (isUnique) params.append('unique', 'true');
    return fetch(`${API_URL}/api/admin/stats?${params}`, { headers: { Authorization: `Bearer ${WebApp.initData}` } })
      .then(async response => {
        if (!response.ok) throw new Error(`Ошибка ${response.status}: ${await response.text()}`);
        setStats(await response.json());
        setStatsError(false);
      })
      .catch(error => { console.error(error); setStatsError(true); })
      .finally(() => setLoading(false));
  }, [startDate, endDate, isUnique]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchTrackingLinks(); }, [fetchTrackingLinks]);

  const handleGrantAccess = async () => {
    if (!grantTargetUsername) {
      WebApp.showAlert("Введите @username пользователя");
      return;
    }
    
    setIsGranting(true);
    try {
      let endpoint = `${API_URL}/api/admin/grant`;
      let bodyData = {
        target_username: grantTargetUsername,
        grant_type: grantType
      };

      if (grantType === 'demo_7_days') {
        endpoint = `${API_URL}/api/admin/grant_demo`;
        bodyData = {
          username_or_id: grantTargetUsername,
          days: 7
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          "Authorization": `Bearer ${WebApp.initData}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(bodyData)
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Ошибка при выдаче прав");
      }
      
      WebApp.showAlert(`Успешно выдано!`);
      setGrantTargetUsername('');
    } catch (err) {
      console.error(err);
      WebApp.showAlert(err.message);
    } finally {
      setIsGranting(false);
    }
  };

  const handleRevokeAccess = async () => {
    if (!revokeTargetUsername) {
      WebApp.showAlert("Введите @username пользователя");
      return;
    }
    
    setIsRevoking(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/revoke`, {
        method: 'POST',
        headers: {
          "Authorization": `Bearer ${WebApp.initData}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          target_username: revokeTargetUsername,
          revoke_type: revokeType
        })
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Ошибка при заборе прав");
      }
      
      WebApp.showAlert(`Права успешно забраны!`);
      setRevokeTargetUsername('');
    } catch (err) {
      console.error(err);
      WebApp.showAlert(err.message);
    } finally {
      setIsRevoking(false);
    }
  };

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

  const toggleCategory = (id) => {
    setOpenCategory(openCategory === id ? null : id);
  };

  const allTestIds = (stats?.tests || []).flatMap(cat => cat.tests.map(t => t.id));

  const toggleExportTest = (id) => {
    setExportSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllExport = () => {
    setExportSelectedIds(allTestIds);
  };

  const handleDeselectAllExport = () => {
    setExportSelectedIds([]);
  };

  const handleAiImport = async () => {
    if (!aiImportText.trim()) { WebApp.showAlert('Вставьте текст теста'); return; }
    if (!aiImportCategoryId) { WebApp.showAlert('Выберите категорию'); return; }
    setIsAiImporting(true);
    setAiImportResult(null);
    try {
      const response = await fetch(`${API_URL}/api/admin/tests/ai-import`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${WebApp.initData}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: aiImportText, category_id: parseInt(aiImportCategoryId) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Ошибка');
      setAiImportResult({ success: true, ...data });
      setAiImportText('');
      fetchStats();
    } catch (e) {
      setAiImportResult({ success: false, error: e.message });
    } finally {
      setIsAiImporting(false);
    }
  };

  const handleExport = async () => {
    if (exportSelectedIds.length === 0) {
      WebApp.showAlert('Выберите хотя бы один тест');
      return;
    }
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      params.append('test_ids', exportSelectedIds.join(','));
      const response = await fetch(`${API_URL}/api/admin/tests/export?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${WebApp.initData}` }
      });
      if (!response.ok) throw new Error(await response.text());
      const { token } = await response.json();
      const downloadUrl = `${API_URL}/api/admin/tests/export/download?token=${token}`;
      WebApp.openLink(downloadUrl);
    } catch (e) {
      console.error(e);
      WebApp.showAlert('Ошибка при экспорте: ' + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  if (editingTestId !== undefined) {
    return (
      <AdminTestEditor 
        testId={editingTestId} 
        categories={stats?.tests ? stats.tests.map(c => ({ id: c.id, name: c.name })) : []} 
        onClose={() => { setEditingTestId(undefined); fetchStats(); }} 
      />
    );
  }

  return (
    <div className="admin-content flex flex-col w-full">

      <div className="ui-card mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="text-[#F5E6D3] text-sm font-medium mb-1 block">С:</label>
          <input 
            type="datetime-local" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-rose-950/50 text-[#F5E6D3] p-3 rounded-xl focus:outline-none"
          />
        </div>
        <div>
          <label className="text-[#F5E6D3] text-sm font-medium mb-1 block">По:</label>
          <input 
            type="datetime-local" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full bg-rose-950/50 text-[#F5E6D3] p-3 rounded-xl focus:outline-none"
          />
        </div>
        <div>
          <label className="text-[#F5E6D3] text-sm font-medium mb-1 block">Режим:</label>
          <select 
            value={isUnique ? 'unique' : 'total'}
            onChange={(e) => setIsUnique(e.target.value === 'unique')}
            className="w-full bg-rose-950/50 text-[#F5E6D3] p-3 rounded-xl focus:outline-none"
          >
            <option value="total">Общее</option>
            <option value="unique">Уникальное</option>
          </select>
        </div>
      </div>

      {/* НОВЫЙ БЛОК: ССЫЛКИ */}
      <div className="ui-card mb-6">
        <h3 className="text-xl font-bold text-[#F5E6D3] mb-4 flex items-center gap-2">
          <Link2 size={24} className="text-[#F5E6D3]/75" />
          Ссылки
        </h3>
        
        <div className="flex flex-wrap gap-2 mb-4">
          <input 
            type="text" 
            placeholder="Название ссылки"
            value={newLinkName}
            onChange={(e) => setNewLinkName(e.target.value)}
            className="min-w-0 flex-1 bg-rose-950/50 text-[#F5E6D3] p-3 rounded-xl focus:outline-none"
          />
          <button 
            onClick={handleCreateLink}
            disabled={!newLinkName || isCreatingLink}
            className="bg-emerald-800 hover:bg-emerald-800 disabled:opacity-50 text-white px-4 py-3 rounded-xl font-medium transition-colors"
          >
            {isCreatingLink ? "..." : "Создать"}
          </button>
        </div>

        {linksError ? <ScreenState error title="Не удалось загрузить ссылки" onRetry={fetchTrackingLinks} /> : isLoadingLinks ? (
          <div className="text-[#F5E6D3]/60 text-center py-4">Загрузка ссылок...</div>
        ) : trackingLinks.length > 0 ? (
          <div className="flex flex-col gap-3">
            {trackingLinks.map(link => (
              <div key={link.id} className="bg-rose-950/40 p-4 rounded-xl flex flex-col gap-2 relative">
                <div className="flex justify-between items-start pr-8">
                  <div className="font-medium text-[#F5E6D3]">{link.name}</div>
                  <div className="flex items-center gap-1 text-[#7BA887] bg-emerald-900/30 px-2 py-1 rounded-lg text-sm font-bold">
                    <Users size={14} /> {link.clicks_count}
                  </div>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    readOnly 
                    value={`https://t.me/abcofmebot?start=tr_${link.code}`}
                    className="min-w-0 flex-1 bg-rose-950 text-[#F5E6D3]/70 text-xs p-2 rounded-lg outline-none"
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(`https://t.me/abcofmebot?start=tr_${link.code}`);
                      WebApp.showAlert("Ссылка скопирована!");
                    }}
                    className="bg-rose-800 hover:bg-rose-700 text-[#F5E6D3] px-3 rounded-lg text-xs font-medium transition-colors"
                  >
                    Копировать
                  </button>
                </div>
                <button 
                  onClick={() => handleDeleteLink(link.id)}
                  className="absolute top-3 right-3 text-red-400 hover:text-red-300 transition-colors p-1"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[#F5E6D3]/50 text-sm text-center py-4 bg-rose-950/20 rounded-xl">
            Нет созданных ссылок
          </div>
        )}
      </div>

      {statsError && <ScreenState error title="Не удалось обновить статистику" onRetry={fetchStats} />}
      {loading && !stats ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white"></div>
        </div>
      ) : stats ? (
        <div className="flex flex-col gap-4">
          <div className="admin-metrics">
          <div className="ui-card flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="text-[#F5E6D3]/75" size={24} />
              <span className="text-[#F5E6D3] font-medium">Всего пользователей</span>
            </div>
            <span className="text-xl font-bold text-[#F5E6D3]">{stats.total_users || 0}</span>
          </div>

          <div className="ui-card flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Check className="text-[#7BA887]" size={24} />
              <span className="text-[#F5E6D3] font-medium">Активных пользователей</span>
            </div>
            <span className="text-xl font-bold text-[#F5E6D3]">{stats.active_users || 0}</span>
          </div>
          
          <div className="ui-card flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="text-[#7BA887]" size={24} />
              <span className="text-[#F5E6D3] font-medium">Записи дневника</span>
            </div>
            <span className="text-xl font-bold text-[#F5E6D3]">{stats.diary_entries || 0}</span>
          </div>

          <div className="bg-rose-900 border border-[#F5E6D3]/10 rounded-3xl overflow-hidden shadow-sm transition-all duration-300">
            <button
              onClick={() => setOpenReports(!openReports)}
              className="w-full flex items-center justify-between p-5 hover:bg-rose-800/70 transition-colors active:bg-rose-800"
            >
              <div className="flex items-center gap-3">
                <Brain className="text-orange-500" size={24} />
                <span className="text-[#F5E6D3] font-medium">Отчеты</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold text-[#F5E6D3]">{stats.reports_generated || 0}</span>
                {openReports ? <ChevronUp size={22} className="text-[#F5E6D3]" /> : <ChevronDown size={22} className="text-[#F5E6D3]" />}
              </div>
            </button>
            {openReports && stats.reports_by_type && stats.reports_by_type.length > 0 && (
              <div className="bg-rose-950/30 px-5 py-3 flex flex-col gap-3 border-t border-rose-800/50">
                {stats.reports_by_type.map(rt => (
                  <div key={rt.type} className="flex justify-between items-center text-sm">
                    <span className="text-[#F5E6D3]/80">{rt.name}</span>
                    <span className="font-bold text-[#F5E6D3]">{rt.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ui-card flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="text-[#7BA887]" size={24} />
              <span className="text-[#F5E6D3] font-medium">Портреты личности</span>
            </div>
            <span className="text-xl font-bold text-[#F5E6D3]">{stats.portraits_generated || 0}</span>
          </div>

          <div className="ui-card flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Heart className="text-[#D0B8A5]" size={24} />
              <span className="text-[#F5E6D3] font-medium">Отчеты совместимости</span>
            </div>
            <span className="text-xl font-bold text-[#F5E6D3]">{stats.compat_reports_generated || 0}</span>
          </div>

          </div>
          <h3 className="text-xl font-bold text-[#F5E6D3] mt-8 mb-4">Управление доступом</h3>
          <div className="ui-card flex flex-col gap-4 shadow-sm">
            <div>
              <label className="text-[#F5E6D3] text-sm font-medium mb-1 block">Telegram @username пользователя:</label>
              <input 
                type="text" 
                value={grantTargetUsername} 
                onChange={(e) => setGrantTargetUsername(e.target.value)}
                placeholder="Например, @username"
                className="w-full bg-rose-950/50 text-[#F5E6D3] p-3 rounded-xl focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[#F5E6D3] text-sm font-medium mb-1 block">Что выдать:</label>
              <select 
                value={grantType}
                onChange={(e) => setGrantType(e.target.value)}
                className="w-full bg-rose-950/50 text-[#F5E6D3] p-3 rounded-xl focus:outline-none"
              >
                <option value="premium">Вечный Premium</option>
                <option value="demo_7_days">Premium на 7 дней</option>
              </select>
            </div>
            <button 
              onClick={handleGrantAccess}
              disabled={isGranting}
              className="w-full bg-emerald-800 hover:bg-emerald-800 disabled:opacity-50 text-[#F5E6D3] font-bold py-3.5 rounded-xl transition-colors shadow-sm"
            >
              {isGranting ? "Обработка..." : "Выдать права"}
            </button>
          </div>

          <div className="ui-card flex flex-col gap-4 shadow-sm mt-4">
            <div>
              <label className="text-[#F5E6D3] text-sm font-medium mb-1 block">Забрать права у @username:</label>
              <input 
                type="text" 
                value={revokeTargetUsername} 
                onChange={(e) => setRevokeTargetUsername(e.target.value)}
                placeholder="Например, @username"
                className="w-full bg-rose-950/50 text-[#F5E6D3] p-3 rounded-xl focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[#F5E6D3] text-sm font-medium mb-1 block">Что забрать:</label>
              <select 
                value={revokeType}
                onChange={(e) => setRevokeType(e.target.value)}
                className="w-full bg-rose-950/50 text-[#F5E6D3] p-3 rounded-xl focus:outline-none"
              >
                <option value="premium">Premium</option>
              </select>
            </div>
            <button 
              onClick={handleRevokeAccess}
              disabled={isRevoking}
              className="w-full bg-rose-800 hover:bg-rose-700 disabled:opacity-50 text-[#F5E6D3] font-bold py-3.5 rounded-xl transition-colors shadow-sm"
            >
              {isRevoking ? "Обработка..." : "Забрать права"}
            </button>
          </div>

          <h3 className="text-xl font-bold text-[#F5E6D3] mt-8 mb-2">Статистика по тестам</h3>
          {(stats.tests || []).map(cat => (
            <div key={cat.id} className="bg-rose-900 border border-[#F5E6D3]/10 rounded-3xl overflow-hidden shadow-sm transition-all duration-300">
              <button
                onClick={() => toggleCategory(cat.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-rose-800/70 transition-colors active:bg-rose-800"
              >
                <span className="font-semibold text-[#F5E6D3] text-left text-base sm:text-lg pr-4 leading-tight">
                  {cat.name}
                </span>
                {openCategory === cat.id ? (
                  <ChevronUp size={22} className="text-[#F5E6D3] shrink-0" />
                ) : (
                  <ChevronDown size={22} className="text-[#F5E6D3] shrink-0" />
                )}
              </button>

              {openCategory === cat.id && (
                <div className="bg-rose-950/40 px-4 py-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  {cat.tests.length === 0 ? (
                    <div className="text-[#F5E6D3] text-sm py-3 italic">В этой категории пока нет тестов.</div>
                  ) : (
                    cat.tests.map(test => (
                      <div key={test.id} className="flex items-center justify-between py-3.5">
                        <span className="text-sm sm:text-base font-medium pr-3 text-[#F5E6D3]">
                          {test.name}
                        </span>
                        <span className="text-[#F5E6D3] font-bold">{test.count}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}


          <div className="flex items-center justify-between mt-8 mb-4">
            <h3 className="text-xl font-bold text-[#F5E6D3]">ИИ-импорт теста</h3>
          </div>
          <div className="bg-rose-900/40 p-4 rounded-3xl mb-2">
            <div className="mb-3">
              <label className="text-[#F5E6D3]/70 text-xs font-bold uppercase tracking-wider mb-1.5 block">Категория</label>
              <select
                value={aiImportCategoryId}
                onChange={e => setAiImportCategoryId(e.target.value)}
                className="w-full bg-rose-950/60 text-[#F5E6D3] p-3 rounded-xl focus:outline-none text-sm"
              >
                <option value="">— выберите категорию —</option>
                {(stats.tests || []).map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div className="mb-3">
              <label className="text-[#F5E6D3]/70 text-xs font-bold uppercase tracking-wider mb-1.5 block">Сырой текст теста</label>
              <textarea
                value={aiImportText}
                onChange={e => setAiImportText(e.target.value)}
                placeholder="Вставьте текст теста: вопросы, варианты ответов с баллами, интерпретации..."
                rows={8}
                className="w-full bg-rose-950/60 text-[#F5E6D3] p-3 rounded-xl focus:outline-none text-sm resize-none placeholder:text-[#F5E6D3]/30"
              />
            </div>
            {aiImportResult && (
              <div className={`mb-3 p-3 rounded-xl text-sm font-medium ${aiImportResult.success ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'}`}>
                {aiImportResult.success
                  ? `✓ Тест «${aiImportResult.test_name}» создан: ${aiImportResult.questions_count} вопр., ${aiImportResult.results_count} интерпр.`
                  : `✗ Ошибка: ${aiImportResult.error}`}
              </div>
            )}
            <button
              onClick={handleAiImport}
              disabled={isAiImporting || !aiImportText.trim() || !aiImportCategoryId}
              className="w-full py-3 bg-emerald-800 hover:bg-emerald-700 disabled:bg-emerald-950/40 disabled:text-[#F5E6D3]/40 text-[#F5E6D3] font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <Brain size={18} />
              {isAiImporting ? 'ИИ обрабатывает...' : 'Создать тест через ИИ'}
            </button>
          </div>

          <div className="flex items-center justify-between mt-8 mb-4">
            <h3 className="text-xl font-bold text-[#F5E6D3]">Экспорт тестов</h3>
          </div>
          <div className="bg-rose-900/40 p-4 rounded-3xl mb-2">
            <div className="flex gap-2 mb-3">
              <button
                onClick={handleSelectAllExport}
                className="flex-1 py-2 bg-rose-800/60 hover:bg-rose-800 text-[#F5E6D3] text-sm font-bold rounded-xl transition-colors"
              >
                Выбрать все
              </button>
              <button
                onClick={handleDeselectAllExport}
                className="flex-1 py-2 bg-rose-800/60 hover:bg-rose-800 text-[#F5E6D3] text-sm font-bold rounded-xl transition-colors"
              >
                Снять все
              </button>
            </div>

            <div className="flex flex-col gap-1 mb-4 max-h-64 overflow-y-auto pr-1">
              {(stats.tests || []).map(cat => (
                <div key={`exp-cat-${cat.id}`}>
                  <div className="text-xs font-bold text-[#F5E6D3]/60 uppercase tracking-wider px-1 py-1.5">{cat.name}</div>
                  {cat.tests.map(test => (
                    <label
                      key={`exp-test-${test.id}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-rose-800/40 cursor-pointer transition-colors"
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${exportSelectedIds.includes(test.id) ? 'bg-emerald-700 border-emerald-600' : 'border-[#F5E6D3]/40'}`}>
                        {exportSelectedIds.includes(test.id) && <Check size={12} className="text-white" strokeWidth={3} />}
                      </div>
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={exportSelectedIds.includes(test.id)}
                        onChange={() => toggleExportTest(test.id)}
                      />
                      <span className="text-sm text-[#F5E6D3] leading-tight">{test.name}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>

            <button
              onClick={handleExport}
              disabled={isExporting || exportSelectedIds.length === 0}
              className="w-full py-3 bg-emerald-800 hover:bg-emerald-700 disabled:bg-emerald-950/40 disabled:text-[#F5E6D3]/50 text-[#F5E6D3] font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <Download size={18} />
              {isExporting ? 'Экспорт...' : `Скачать TXT${exportSelectedIds.length > 0 ? ` (${exportSelectedIds.length})` : ''}`}
            </button>
          </div>

          <div className="flex items-center justify-between mt-8 mb-4">
            <h3 className="text-xl font-bold text-[#F5E6D3]">Управление тестами</h3>
            <button 
              onClick={() => setEditingTestId(null)}
              className="p-2 px-3 bg-emerald-800/20 text-[#7BA887] hover:bg-emerald-800/30 rounded-xl transition-colors flex items-center gap-1 text-sm font-bold"
            >
              <Plus size={16} /> Создать тест
            </button>
          </div>
          <div className="bg-rose-900/40 p-4 rounded-3xl">
            {(stats.tests || []).map(cat => (
              <div key={`edit-cat-${cat.id}`} className="bg-rose-900 border border-[#F5E6D3]/10 rounded-3xl overflow-hidden shadow-sm transition-all duration-300 mb-3 last:mb-0">
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
                  <div className="bg-rose-950/40 px-4 py-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    {cat.tests.length === 0 ? (
                      <div className="text-[#F5E6D3] text-sm py-3 italic">В этой категории нет тестов.</div>
                    ) : (
                      cat.tests.map(test => (
                        <div key={`edit-test-${test.id}`} className="flex items-center justify-between py-3.5 last:">
                          <span className="text-sm sm:text-base font-medium pr-3 text-[#F5E6D3] flex-1">
                            {test.name}
                          </span>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => setEditingTestId(test.id)}
                              className="p-2 text-emerald-600 hover:text-[#7BA887] hover:bg-emerald-800/10 rounded-lg transition-colors"
                            >
                              <Edit size={20} />
                            </button>
                            <button 
                              onClick={() => handleDeleteTest(test.id, test.name)}
                              disabled={isDeleting}
                              className="p-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <Trash2 size={20} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      ) : null}
    </div>
  );
}
