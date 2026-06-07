import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronDown, ChevronUp, Users, Calendar, Brain, FileText, CheckCircle } from 'lucide-react';

const WebApp = window.Telegram.WebApp;
const API_URL = "https://friendly-various-near-across.trycloudflare.com";

export default function AdminPanel({ onBack }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isUnique, setIsUnique] = useState(false);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openCategory, setOpenCategory] = useState(null);

  useEffect(() => {
    fetchStats();
  }, [startDate, endDate, isUnique]);

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
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
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

  const toggleCategory = (id) => {
    setOpenCategory(openCategory === id ? null : id);
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-6 animate-in fade-in slide-in-from-right-8 duration-500 flex flex-col w-full">
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-[#F5E6D3] hover:text-[#F5E6D3] mb-6 transition-colors self-start"
      >
        <ChevronLeft size={20} />
        <span className="font-medium">Назад в профиль</span>
      </button>

      <h2 className="text-2xl font-bold text-[#F5E6D3] mb-6">Админ-панель</h2>

      <div className="bg-rose-900/60 p-5 rounded-3xl mb-6 flex flex-col gap-4">
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

      {loading && !stats ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white"></div>
        </div>
      ) : stats ? (
        <div className="flex flex-col gap-4">
          
          <div className="bg-rose-900/60 p-5 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="text-blue-500" size={24} />
              <span className="text-[#F5E6D3] font-medium">Записи в дневник</span>
            </div>
            <span className="text-xl font-bold text-[#F5E6D3]">{stats.diary_count}</span>
          </div>

          <div className="bg-rose-900/60 p-5 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Brain className="text-orange-500" size={24} />
              <span className="text-[#F5E6D3] font-medium">Отчеты</span>
            </div>
            <span className="text-xl font-bold text-[#F5E6D3]">{stats.reports_count}</span>
          </div>

          <div className="bg-rose-900/60 p-5 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="text-emerald-500" size={24} />
              <span className="text-[#F5E6D3] font-medium">Портреты личности</span>
            </div>
            <span className="text-xl font-bold text-[#F5E6D3]">{stats.portraits_count}</span>
          </div>

          <h3 className="text-xl font-bold text-[#F5E6D3] mt-4 mb-2">Количество прохождений тестов</h3>
          {stats.test_counts.map(cat => (
            <div key={cat.id} className="bg-rose-900 rounded-2xl overflow-hidden shadow-sm transition-all duration-700">
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
                <div className="bg-rose-950/40 px-4 py-2">
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

        </div>
      ) : null}
    </div>
  );
}
