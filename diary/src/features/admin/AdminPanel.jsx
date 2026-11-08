import Select from '../../components/Select';
import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Users, Brain, Check, Trash2, Edit, Plus, Link2, Download, X } from '../../components/ClayIcon';
import AdminTestEditor from './AdminTestEditor';
import AdminMonitoring from './AdminMonitoring';
import AdminStats from './AdminStats';
import ScreenState from '../../components/ScreenState';
import { authHeader, isSignedIn } from '../../utils/platform';
import { api } from '../../utils/api';

const WebApp = window.Telegram.WebApp;
const API_URL = window.location.origin;

// section=monitoring — сразу раздел мониторинга (ссылка из алерта в Telegram)
export default function AdminPanel({ section }) {
  const [view, setView] = useState(section === 'monitoring' ? 'monitoring' : 'stats');
  const [unseenAlerts, setUnseenAlerts] = useState(0);
  useEffect(() => {
    api('/api/admin/alerts').then(data => setUnseenAlerts(data.unseen)).catch(() => {});
  }, []);
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState(false);
  const [linksError, setLinksError] = useState(false);
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
    if (!isSignedIn()) return Promise.resolve();
    return fetch(`${API_URL}/api/admin/tracking_links`, { headers: { Authorization: authHeader() } })
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
          "Authorization": authHeader(),
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
          headers: { "Authorization": authHeader() }
        });
        if (response.ok) {
          fetchTrackingLinks();
        }
      } catch (e) {
        console.error(e);
      }
    });
  };

  const fetchTestCatalog = useCallback(() => api('/api/admin/test_catalog')
    .then(data => { setCatalog(data); setCatalogError(false); })
    .catch(() => setCatalogError(true)), []);

  useEffect(() => {
    if (view === 'tools') {
      fetchTestCatalog();
      fetchTrackingLinks();
    }
  }, [view, fetchTestCatalog, fetchTrackingLinks]);

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
          "Authorization": authHeader(),
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
          "Authorization": authHeader(),
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
        headers: { "Authorization": authHeader() }
      });
      
      if (!response.ok) {
        throw new Error(`Ошибка ${response.status}: ${await response.text()}`);
      }
      
      WebApp.showAlert("Тест успешно удален");
      fetchTestCatalog();
    } catch (error) {
      console.error(error);
      WebApp.showAlert(error.message || "Ошибка при удалении теста");
    } finally {
      setIsDeleting(false);
    }
  };

  const allTestIds = (catalog ?? []).flatMap(cat => cat.tests.map(t => t.id));

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
        headers: { 'Authorization': authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: aiImportText, category_id: parseInt(aiImportCategoryId) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Ошибка');
      setAiImportResult({ success: true, ...data });
      setAiImportText('');
      fetchTestCatalog();
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
        headers: { 'Authorization': authHeader() }
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
        categories={catalog ?? []}
        onClose={() => { setEditingTestId(undefined); fetchTestCatalog(); }}
      />
    );
  }

  return (
    <div className="admin-content flex flex-col w-full">
      <div role="tablist" aria-label="Разделы админ-панели" className="ui-segmented admin-tabs mb-6">
        <button type="button" role="tab" aria-selected={view === 'stats'} onClick={() => setView('stats')}>Статистика</button>
        <button type="button" role="tab" aria-selected={view === 'monitoring'} onClick={() => setView('monitoring')}>
          Мониторинг{unseenAlerts > 0 && <span className="admin-badge" aria-label={`новых алертов: ${unseenAlerts}`}>{unseenAlerts > 99 ? '99+' : unseenAlerts}</span>}
        </button>
        <button type="button" role="tab" aria-selected={view === 'tools'} onClick={() => setView('tools')}>Управление</button>
      </div>
      <div hidden={view !== 'stats'}><AdminStats active={view === 'stats'} /></div>
      {view === 'monitoring' && <AdminMonitoring onAlertsSeen={() => setUnseenAlerts(0)} />}
      {view === 'tools' && <>

      <div className="ui-card mb-6">
        <h3 className="text-xl font-bold text-[var(--ui-text)] mb-4 flex items-center gap-2">
          <Link2 size={24} className="text-[var(--ui-secondary)]" />
          Ссылки
        </h3>
        <p className="ui-muted mb-4">Счётчик показывает, сколько пользователей привязано к ссылке.</p>
        
        <div className="flex flex-wrap gap-2 mb-4">
          <input 
            type="text" 
            placeholder="Название ссылки"
            value={newLinkName}
            onChange={(e) => setNewLinkName(e.target.value)}
            className="min-w-0 flex-1 bg-rose-950/50 text-[var(--ui-text)] p-3 rounded-xl focus:outline-none"
          />
          <button 
            onClick={handleCreateLink}
            disabled={!newLinkName || isCreatingLink}
            className="ui-action-surface disabled:opacity-50  px-4 py-3 rounded-xl font-medium transition-colors"
          >
            {isCreatingLink ? "..." : "Создать"}
          </button>
        </div>

        {linksError ? <ScreenState error title="Не удалось загрузить ссылки" onRetry={fetchTrackingLinks} /> : isLoadingLinks ? (
          <div className="text-[var(--ui-muted)] text-center py-4">Загрузка ссылок...</div>
        ) : trackingLinks.length > 0 ? (
          <div className="flex flex-col gap-3">
            {trackingLinks.map(link => (
              <div key={link.id} className="bg-rose-950/40 p-4 rounded-xl flex flex-col gap-2 relative">
                <div className="flex justify-between items-start pr-8">
                  <div className="font-medium text-[var(--ui-text)]">{link.name}</div>
                  <div className="flex items-center gap-1 text-[var(--ui-sage)] bg-emerald-900/30 px-2 py-1 rounded-lg text-sm font-bold">
                    <Users size={14} aria-hidden="true" /> {link.clicks_count.toLocaleString('ru-RU')}
                  </div>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    readOnly 
                    value={`https://t.me/abcofmebot?start=tr_${link.code}`}
                    className="min-w-0 flex-1 bg-rose-950 text-[var(--ui-secondary)] text-xs p-2 rounded-lg outline-none"
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(`https://t.me/abcofmebot?start=tr_${link.code}`);
                      WebApp.showAlert("Ссылка скопирована!");
                    }}
                    className="bg-rose-800 hover:bg-rose-700 text-[var(--ui-text)] px-3 rounded-lg text-xs font-medium transition-colors"
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
          <div className="text-[var(--ui-muted)] text-sm text-center py-4 bg-rose-950/20 rounded-xl">
            Нет созданных ссылок
          </div>
        )}
      </div>

        <div className="flex flex-col gap-4">
          <h3 className="text-xl font-bold text-[var(--ui-text)] mt-8 mb-4">Управление доступом</h3>
          <div className="ui-card flex flex-col gap-4">
            <div>
              <label className="text-[var(--ui-text)] text-sm font-medium mb-1 block">Telegram @username пользователя:</label>
              <input 
                type="text" 
                value={grantTargetUsername} 
                onChange={(e) => setGrantTargetUsername(e.target.value)}
                placeholder="Например, @username"
                className="w-full bg-rose-950/50 text-[var(--ui-text)] p-3 rounded-xl focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[var(--ui-text)] text-sm font-medium mb-1 block">Что выдать:</label>
              <Select
                value={grantType}
                onChange={(e) => setGrantType(e.target.value)}
                className="w-full bg-rose-950/50 text-[var(--ui-text)] p-3 rounded-xl focus:outline-none"
              >
                <option value="premium">Вечный Premium</option>
                <option value="demo_7_days">Premium на 7 дней</option>
              </Select>
            </div>
            <button 
              onClick={handleGrantAccess}
              disabled={isGranting}
              className="w-full ui-action-surface disabled:opacity-50  font-bold py-3.5 rounded-xl transition-colors clay-raised-sm"
            >
              {isGranting ? "Обработка..." : "Выдать права"}
            </button>
          </div>

          <div className="ui-card flex flex-col gap-4 mt-4">
            <div>
              <label className="text-[var(--ui-text)] text-sm font-medium mb-1 block">Забрать права у @username:</label>
              <input 
                type="text" 
                value={revokeTargetUsername} 
                onChange={(e) => setRevokeTargetUsername(e.target.value)}
                placeholder="Например, @username"
                className="w-full bg-rose-950/50 text-[var(--ui-text)] p-3 rounded-xl focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[var(--ui-text)] text-sm font-medium mb-1 block">Что забрать:</label>
              <Select
                value={revokeType}
                onChange={(e) => setRevokeType(e.target.value)}
                className="w-full bg-rose-950/50 text-[var(--ui-text)] p-3 rounded-xl focus:outline-none"
              >
                <option value="premium">Premium</option>
              </Select>
            </div>
            <button 
              onClick={handleRevokeAccess}
              disabled={isRevoking}
              className="w-full bg-rose-800 hover:bg-rose-700 disabled:opacity-50 text-[var(--ui-text)] font-bold py-3.5 rounded-xl transition-colors clay-raised-sm"
            >
              {isRevoking ? "Обработка..." : "Забрать права"}
            </button>
          </div>

          {catalogError ? <ScreenState error title="Не удалось загрузить каталог тестов" onRetry={fetchTestCatalog} />
            : !catalog ? <ScreenState loading title="Загрузка каталога тестов…" /> : <>
          <div className="flex items-center justify-between mt-8 mb-4">
            <h3 className="text-xl font-bold text-[var(--ui-text)]">ИИ-импорт теста</h3>
          </div>
          <div className="bg-rose-900/40 p-4 rounded-3xl mb-2">
            <div className="mb-3">
              <label className="text-[var(--ui-secondary)] text-xs font-bold uppercase tracking-wider mb-1.5 block">Категория</label>
              <Select
                value={aiImportCategoryId}
                onChange={e => setAiImportCategoryId(e.target.value)}
                className="w-full bg-rose-950/60 text-[var(--ui-text)] p-3 rounded-xl focus:outline-none text-sm"
              >
                <option value="">— выберите категорию —</option>
                {catalog.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </Select>
            </div>
            <div className="mb-3">
              <label className="text-[var(--ui-secondary)] text-xs font-bold uppercase tracking-wider mb-1.5 block">Сырой текст теста</label>
              <textarea
                value={aiImportText}
                onChange={e => setAiImportText(e.target.value)}
                placeholder="Вставьте текст теста: вопросы, варианты ответов с баллами, интерпретации..."
                rows={8}
                className="w-full bg-rose-950/60 text-[var(--ui-text)] p-3 rounded-xl focus:outline-none text-sm resize-none placeholder:text-[var(--ui-muted)]"
              />
            </div>
            {aiImportResult && (
              <div className={`mb-3 p-3 rounded-xl text-sm font-medium ${aiImportResult.success ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'}`}>
                {aiImportResult.success
                  ? <><Check size={16} className="mr-1" />Тест «{aiImportResult.test_name}» создан: {aiImportResult.questions_count} вопр., {aiImportResult.results_count} интерпр.</>
                  : <><X size={16} className="mr-1" />Ошибка: {aiImportResult.error}</>}
              </div>
            )}
            <button
              onClick={handleAiImport}
              disabled={isAiImporting || !aiImportText.trim() || !aiImportCategoryId}
              className="w-full py-3 ui-action-surface disabled:bg-rose-800 disabled:text-[var(--ui-muted)]  font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <Brain size={18} />
              {isAiImporting ? 'ИИ обрабатывает...' : 'Создать тест через ИИ'}
            </button>
          </div>

          <div className="flex items-center justify-between mt-8 mb-4">
            <h3 className="text-xl font-bold text-[var(--ui-text)]">Экспорт тестов</h3>
          </div>
          <div className="bg-rose-900/40 p-4 rounded-3xl mb-2">
            <div className="flex gap-2 mb-3">
              <button
                onClick={handleSelectAllExport}
                className="flex-1 py-2 bg-rose-800/60 hover:bg-rose-800 text-[var(--ui-text)] text-sm font-bold rounded-xl transition-colors"
              >
                Выбрать все
              </button>
              <button
                onClick={handleDeselectAllExport}
                className="flex-1 py-2 bg-rose-800/60 hover:bg-rose-800 text-[var(--ui-text)] text-sm font-bold rounded-xl transition-colors"
              >
                Снять все
              </button>
            </div>

            <div className="flex flex-col gap-1 mb-4 max-h-64 overflow-y-auto pr-1">
              {catalog.map(cat => (
                <div key={`exp-cat-${cat.id}`}>
                  <div className="text-xs font-bold text-[var(--ui-muted)] uppercase tracking-wider px-1 py-1.5">{cat.name}</div>
                  {cat.tests.map(test => (
                    <label
                      key={`exp-test-${test.id}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-rose-800/40 cursor-pointer transition-colors"
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${exportSelectedIds.includes(test.id) ? 'ui-action-surface border-[var(--ui-sage)]' : 'border-[var(--ui-text)]/40'}`}>
                        {exportSelectedIds.includes(test.id) && <Check size={12} className="text-[var(--ui-text)]" strokeWidth={3} />}
                      </div>
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={exportSelectedIds.includes(test.id)}
                        onChange={() => toggleExportTest(test.id)}
                      />
                      <span className="text-sm text-[var(--ui-text)] leading-tight">{test.name}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>

            <button
              onClick={handleExport}
              disabled={isExporting || exportSelectedIds.length === 0}
              className="w-full py-3 ui-action-surface disabled:bg-rose-800 disabled:text-[var(--ui-muted)]  font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <Download size={18} />
              {isExporting ? 'Экспорт...' : `Скачать TXT${exportSelectedIds.length > 0 ? ` (${exportSelectedIds.length})` : ''}`}
            </button>
          </div>

          <div className="flex items-center justify-between mt-8 mb-4">
            <h3 className="text-xl font-bold text-[var(--ui-text)]">Управление тестами</h3>
            <button 
              onClick={() => setEditingTestId(null)}
              className="p-2 px-3 bg-emerald-800/20 text-[var(--ui-sage)] hover:bg-emerald-800/30 rounded-xl transition-colors flex items-center gap-1 text-sm font-bold"
            >
              <Plus size={16} /> Создать тест
            </button>
          </div>
          <div className="bg-rose-900/40 p-4 rounded-3xl">
            {catalog.map(cat => (
              <div key={`edit-cat-${cat.id}`} className="bg-rose-900 border border-[var(--ui-text)]/10 rounded-3xl overflow-hidden clay-raised transition-all duration-300 mb-3 last:mb-0">
                <button
                  onClick={() => setOpenDeleteCategory(openDeleteCategory === cat.id ? null : cat.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-rose-800/70 transition-colors active:bg-rose-800"
                >
                  <span className="font-semibold text-[var(--ui-text)] text-left text-base sm:text-lg pr-4 leading-tight">
                    {cat.name}
                  </span>
                  {openDeleteCategory === cat.id ? (
                    <ChevronUp size={22} className="text-[var(--ui-text)] shrink-0" />
                  ) : (
                    <ChevronDown size={22} className="text-[var(--ui-text)] shrink-0" />
                  )}
                </button>

                {openDeleteCategory === cat.id && (
                  <div className="bg-rose-950/40 px-4 py-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    {cat.tests.length === 0 ? (
                      <div className="text-[var(--ui-text)] text-sm py-3 italic">В этой категории нет тестов.</div>
                    ) : (
                      cat.tests.map(test => (
                        <div key={`edit-test-${test.id}`} className="flex items-center justify-between py-3.5 last:">
                          <span className="text-sm sm:text-base font-medium pr-3 text-[var(--ui-text)] flex-1">
                            {test.name}
                          </span>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => setEditingTestId(test.id)}
                              className="p-2 text-emerald-600 hover:text-[var(--ui-sage)] hover:bg-emerald-800/10 rounded-lg transition-colors"
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

          </>}
        </div>
      </>}
    </div>
  );
}
