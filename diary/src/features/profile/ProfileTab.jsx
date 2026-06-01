import React, { useState, useEffect } from 'react';
import { User, ChevronDown, ChevronUp, CheckCircle, XCircle, X } from 'lucide-react';

const WebApp = window.Telegram.WebApp;
const API_URL = "https://restoration-relative-federation-forth.trycloudflare.com";

export default function ProfileTab() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Новый стейт для вкладок
  const [activeTab, setActiveTab] = useState('tests'); // 'tests' | 'reports'

  // Хранит ID открытой категории (аккордеон)
  const [openCategory, setOpenCategory] = useState(null);
  
  // Хранит данные теста, по которому кликнули, для показа в модальном окне
  const [selectedResult, setSelectedResult] = useState(null);

  // Получаем данные пользователя из Telegram (если открыто в браузере - ставим заглушку)
  const tgUser = WebApp.initDataUnsafe?.user || {
    first_name: "Пользователь",
    username: "username",
    photo_url: ""
  };

  // Загружаем данные с бэкенда при открытии вкладки
  useEffect(() => {
    if (WebApp.initData) {
      fetch(`${API_URL}/api/profile`, {
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      })
        .then(res => res.json())
        .then(data => {
          setCategories(data.categories || []);
          setLoading(false);
        })
        .catch(err => {
          console.error("Ошибка загрузки профиля:", err);
          setLoading(false);
        });
    } else {
      // Защита для локального тестирования
      setLoading(false);
    }
  }, []);

  const toggleCategory = (id) => {
    setOpenCategory(openCategory === id ? null : id);
  };

  const openResultModal = (test) => {
    if (test.passed) {
      setSelectedResult(test);
      WebApp.HapticFeedback.selectionChanged(); // Легкая вибрация при открытии
    }
  };

  return (
    <div className="flex flex-col h-full relative select-none bg-transparent">
      {/* 1. ШАПКА ПРОФИЛЯ (Аватар и Юзернейм) */}
      <div className="flex items-center gap-4 p-4 sm:p-6 bg-neutral-900/60 border border-neutral-800/80 rounded-3xl mx-2 mt-2 mb-4 backdrop-blur-sm shadow-sm">
        {tgUser.photo_url ? (
          <img src={tgUser.photo_url} alt="Avatar" className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover shadow-lg border-2 border-neutral-700" />
        ) : (
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-900/40 text-blue-400 rounded-full flex items-center justify-center font-bold text-2xl border-2 border-blue-800/50 shadow-inner">
            {tgUser.first_name?.[0] || <User size={32} />}
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <h2 className="text-xl sm:text-2xl font-bold text-neutral-100 truncate">{tgUser.first_name}</h2>
          <p className="text-sm sm:text-base text-blue-400 font-medium truncate">@{tgUser.username}</p>
        </div>
      </div>

      {/* 3. КОНТЕНТ ВКЛАДОК */}
        <div className="flex-1 overflow-y-auto px-2 pb-6 space-y-3">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
            </div>
          ) : categories.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-neutral-500 text-center h-full py-12">
              <p>Здесь будут ваши результаты тестов.</p>
            </div>
          ) : (
            categories.map(cat => (
              <div key={cat.id} className="bg-neutral-900 border border-neutral-800/80 rounded-2xl overflow-hidden shadow-sm transition-all duration-700">
                {/* Кнопка категории (Аккордеон) */}
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-neutral-800/70 transition-colors active:bg-neutral-800"
                >
                  <span className="font-semibold text-neutral-200 text-left text-base sm:text-lg pr-4 leading-tight">
                    {cat.name}
                  </span>
                  {openCategory === cat.id ? (
                    <ChevronUp size={22} className="text-neutral-500 shrink-0" />
                  ) : (
                    <ChevronDown size={22} className="text-neutral-500 shrink-0" />
                  )}
                </button>

                {/* Содержимое категории (Список тестов) */}
                {openCategory === cat.id && (
                  <div className="bg-neutral-950/40 border-t border-neutral-800/80 px-4 py-2">
                    {cat.tests.length === 0 ? (
                      <div className="text-neutral-600 text-sm py-3 italic">В этой категории пока нет тестов.</div>
                    ) : (
                      cat.tests.map(test => (
                        <div
                          key={test.id}
                          onClick={() => openResultModal(test)}
                          className={`flex items-center justify-between py-3.5 border-b border-neutral-800/50 last:border-0 
                          ${ test.passed ? 'cursor-pointer hover:bg-neutral-800/40 -mx-4 px-4 transition-colors active:bg-neutral-800' : 'opacity-60 cursor-default' }`}
                        >
                          <span className="text-sm sm:text-base font-medium pr-3 text-neutral-300">
                            {test.name}
                          </span>
                          {/* Плашка Пройден / Не пройден */}
                          {test.passed ? (
                            <span className="flex items-center gap-1.5 text-emerald-500 text-[11px] sm:text-xs font-bold uppercase tracking-wider bg-emerald-500/10 px-2.5 py-1.5 rounded-lg whitespace-nowrap border border-emerald-500/20 shrink-0">
                              <CheckCircle size={14} /> Пройден
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-red-400 text-[11px] sm:text-xs font-bold uppercase tracking-wider bg-red-400/10 px-2.5 py-1.5 rounded-lg whitespace-nowrap border border-red-400/20 shrink-0">
                              <XCircle size={14} /> Не пройден
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

      {/* 4. ВСПЛЫВАЮЩЕЕ ОКНО С РЕЗУЛЬТАТОМ ТЕСТА */}
      {selectedResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm animate-in fade-in duration-700">
          {/* Область клика вокруг окна для закрытия */}
          <div className="absolute inset-0" onClick={() => setSelectedResult(null)}></div>
          <div className="relative bg-neutral-900 border border-neutral-700 rounded-[2rem] w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-700">
            {/* Заголовок модального окна */}
            <div className="p-5 sm:p-6 border-b border-neutral-800 flex justify-between items-start">
              <div className="pr-4">
                <span className="text-blue-400 text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-1.5 block">
                  Результат тестирования
                </span>
                <h3 className="text-lg sm:text-xl font-bold text-white leading-tight">
                  {selectedResult.name}
                </h3>
              </div>
              <button onClick={() => setSelectedResult(null)} className="p-2 bg-neutral-800/50 hover:bg-neutral-800 rounded-xl text-neutral-400 hover:text-white transition-colors border border-transparent hover:border-neutral-700 shrink-0">
                <X size={20} />
              </button>
            </div>
            {/* Текст результата */}
            <div className="p-5 sm:p-6 overflow-y-auto">
              <div className="text-neutral-300 text-sm sm:text-base leading-relaxed whitespace-pre-wrap">
                {selectedResult.result_text || 'Нет детального описания результата.'}
              </div>
            </div>
            {/* Нижняя кнопка */}
            <div className="p-4 sm:p-5 border-t border-neutral-800 bg-neutral-950/30 rounded-b-[2rem]">
              <button onClick={() => setSelectedResult(null)} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition-all active:bg-blue-700 shadow-lg shadow-blue-900/20">
                Отлично
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}