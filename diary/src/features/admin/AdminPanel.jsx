import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronDown, ChevronUp, Users, Calendar, Brain, FileText, Check, Trash2, Edit, Plus, Heart, Gift, Link2 } from 'lucide-react';
import AdminTestEditor from './AdminTestEditor';

const WebApp = window.Telegram.WebApp;
const API_URL = window.location.origin;

export default function AdminPanel({ onBack }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isUnique, setIsUnique] = useState(false);
  const [stats, setStats] = useState(null);
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
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  useEffect(() => {
    fetchStats();
  }, [startDate, endDate, isUnique]);

  useEffect(() => {
    fetchTrackingLinks();
  }, []);

  const fetchTrackingLinks = async () => {
    if (!WebApp.initData) return;
    setIsLoadingLinks(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/tracking_links`, {
        headers: { "Authorization": `Bearer ${encodeURI(WebApp.initData)}` }
      });
      if (response.ok) {
        setTrackingLinks(await response.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingLinks(false);
    }
  };

  const handleCreateLink = async () => {
    if (!newLinkName) return;
    setIsCreatingLink(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/tracking_links`, {
        method: 'POST',
        headers: {
          "Authorization": `Bearer ${encodeURI(WebApp.initData)}`,
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
          headers: { "Authorization": `Bearer ${encodeURI(WebApp.initData)}` }
        });
        if (response.ok) {
          fetchTrackingLinks();
        }
      } catch (e) {
        console.error(e);
      }
    });
  };

  const fetchStats = async () => {
    if (!WebApp.initData) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (isUnique) params.append('unique', 'true');

      const response = await fetch(`${API_URL}/api/admin/stats?${params.toString()}`, {
        headers: { "Authorization": `Bearer ${encodeURI(WebApp.initData)}` }
      });
      
      if (!response.ok) {
        throw new Error(`Ошибка ${response.status}: ${await response.text()}`);
      }
      
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error(error);
      WebApp.showAlert(error.message || "Ошибка при загрузке статистики");
    } finally {
      setLoading(false);
    }
  };

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
          "Authorization": `Bearer ${encodeURI(WebApp.initData)}`,
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
          "Authorization": `Bearer ${encodeURI(WebApp.initData)}`,
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
        headers: { "Authorization": `Bearer ${encodeURI(WebApp.initData)}` }
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
    <div className="flex-1 overflow-y-auto px-4 pb-6 animate-in fade-in slide-in-from-right-8 duration-300 flex flex-col w-full">
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-[#F5E6D3] hover:text-[#F5E6D3] mb-6 transition-colors self-start"
      >
        <ChevronLeft size={20} />
        <span className="font-medium">Назад в профиль</span>
      </button>

      <h2 className="text-2xl font-bold text-[#F5E6D3] mb-6">Админ-панель</h2>

      <div className="bg-rose-900 p-5 rounded-3xl mb-6 flex flex-col gap-4">
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
      <div className="bg-rose-900 p-5 rounded-3xl mb-6">
        <h3 className="text-xl font-bold text-[#F5E6D3] mb-4 flex items-center gap-2">
          <Link2 size={24} className="text-blue-400" />
          Ссылки
        </h3>
        
        <div className="flex gap-2 mb-4">
          <input 
            type="text" 
            placeholder="Название ссылки"
            value={newLinkName}
            onChange={(e) => setNewLinkName(e.target.value)}
            className="flex-1 bg-rose-950/50 text-[#F5E6D3] p-3 rounded-xl focus:outline-none"
          />
          <button 
            onClick={handleCreateLink}
            disabled={!newLinkName || isCreatingLink}
            className="bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-3 rounded-xl font-medium transition-colors"
          >
            {isCreatingLink ? "..." : "Создать"}
          </button>
        </div>

        {isLoadingLinks ? (
          <div className="text-[#F5E6D3]/60 text-center py-4">Загрузка ссылок...</div>
        ) : trackingLinks.length > 0 ? (
          <div className="flex flex-col gap-3">
            {trackingLinks.map(link => (
              <div key={link.id} className="bg-rose-950/40 p-4 rounded-xl flex flex-col gap-2 relative">
                <div className="flex justify-between items-start pr-8">
                  <div className="font-medium text-[#F5E6D3]">{link.name}</div>
                  <div className="flex items-center gap-1 text-green-400 bg-green-900/30 px-2 py-1 rounded-lg text-sm font-bold">
                    <Users size={14} /> {link.clicks_count}
                  </div>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    readOnly 
                    value={`https://t.me/abcofmebot?start=tr_${link.code}`}
                    className="flex-1 bg-black/20 text-[#F5E6D3]/70 text-xs p-2 rounded-lg outline-none"
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(`https://t.me/abcofmebot?start=tr_${link.code}`);
                      WebApp.showAlert("Ссылка скопирована!");
                    }}
                    className="bg-blue-900/50 hover:bg-blue-800/50 text-blue-200 px-3 rounded-lg text-xs font-medium transition-colors"
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

      {loading && !stats ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white"></div>
        </div>
      ) : stats ? (
        <div className="flex flex-col gap-4">
          
          <div className="bg-rose-900 p-5 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="text-purple-500" size={24} />
              <span className="text-[#F5E6D3] font-medium">Всего пользователей</span>
            </div>
            <span className="text-xl font-bold text-[#F5E6D3]">{stats.total_users || 0}</span>
          </div>

          <div className="bg-rose-900 p-5 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Check className="text-green-500" size={24} />
              <span className="text-[#F5E6D3] font-medium">Активных пользователей</span>
            </div>
            <span className="text-xl font-bold text-[#F5E6D3]">{stats.active_users || 0}</span>
          </div>
          
          <div className="bg-rose-900 p-5 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="text-green-700" size={24} />
              <span className="text-[#F5E6D3] font-medium">Записи дневника</span>
            </div>
            <span className="text-xl font-bold text-[#F5E6D3]">{stats.diary_entries || 0}</span>
          </div>

          <div className="bg-rose-900 rounded-2xl overflow-hidden shadow-sm transition-all duration-300">
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

          <div className="bg-rose-900 p-5 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="text-emerald-500" size={24} />
              <span className="text-[#F5E6D3] font-medium">Портреты личности</span>
            </div>
            <span className="text-xl font-bold text-[#F5E6D3]">{stats.portraits_generated || 0}</span>
          </div>

          <div className="bg-rose-900 p-5 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Heart className="text-rose-500" size={24} />
              <span className="text-[#F5E6D3] font-medium">Отчеты совместимости</span>
            </div>
            <span className="text-xl font-bold text-[#F5E6D3]">{stats.compat_reports_generated || 0}</span>
          </div>

          <div className="bg-rose-900 p-5 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Gift className="text-yellow-500" size={24} />
              <span className="text-[#F5E6D3] font-medium">Реферальная программа</span>
            </div>
            <span className="text-xl font-bold text-[#F5E6D3]">{stats.referral_users || 0}</span>
          </div>

          <h3 className="text-xl font-bold text-[#F5E6D3] mt-8 mb-4">Управление доступом</h3>
          <div className="bg-rose-900 p-5 rounded-2xl flex flex-col gap-4 shadow-sm">
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
                <option value="demo_7_days">Демо-доступ (7 дней)</option>
                <option value="career">Блок Профориентация</option>
              </select>
            </div>
            <button 
              onClick={handleGrantAccess}
              disabled={isGranting}
              className="w-full bg-green-800 hover:bg-green-700 disabled:opacity-50 text-[#F5E6D3] font-bold py-3.5 rounded-xl transition-colors shadow-sm"
            >
              {isGranting ? "Обработка..." : "Выдать права"}
            </button>
          </div>

          <div className="bg-rose-900 p-5 rounded-2xl flex flex-col gap-4 shadow-sm mt-4">
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
                <option value="career">Блок Профориентация</option>
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
            <div key={cat.id} className="bg-rose-900 rounded-2xl overflow-hidden shadow-sm transition-all duration-300">
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
            <h3 className="text-xl font-bold text-[#F5E6D3]">Управление тестами</h3>
            <button 
              onClick={() => setEditingTestId(null)}
              className="p-2 px-3 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-xl transition-colors flex items-center gap-1 text-sm font-bold"
            >
              <Plus size={16} /> Создать тест
            </button>
          </div>
          <div className="bg-rose-900/40 p-4 rounded-3xl">
            {(stats.tests || []).map(cat => (
              <div key={`edit-cat-${cat.id}`} className="bg-rose-900 rounded-2xl overflow-hidden shadow-sm transition-all duration-300 mb-3 last:mb-0">
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
                              className="p-2 text-green-600 hover:text-green-500 hover:bg-green-600/10 rounded-lg transition-colors"
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
