import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { User, ChevronDown, ChevronUp, CheckCircle, XCircle, X, ChevronLeft, Lock, Wand2, Trash2, Brain, Activity, Star, ShieldAlert, Sparkles, Zap, Target, Heart, Flame } from 'lucide-react';

const WebApp = window.Telegram.WebApp;
const API_URL = "https://restoration-relative-federation-forth.trycloudflare.com";

export default function ProfileTab() {
  const [categories, setCategories] = useState([]);
  const [totalTests, setTotalTests] = useState(0);
  const [passedTests, setPassedTests] = useState(0);
  const [portraitData, setPortraitData] = useState(null);
  const [isGeneratingPortrait, setIsGeneratingPortrait] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Новый стейт для вкладок
  const [activeSubTab, setActiveSubTab] = useState('tests'); // 'tests' | 'analyses' | 'portrait'

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
          setTotalTests(data.total_tests || 0);
          setPassedTests(data.passed_tests || 0);
          setPortraitData(data.portrait || null);
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

  const handleGeneratePortrait = async () => {
    setIsGeneratingPortrait(true);
    try {
      const response = await fetch(`${API_URL}/api/portrait/generate`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Неизвестная ошибка сервера");
      }
      setPortraitData(data.portrait);
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch (error) {
      console.error(error);
      WebApp.showAlert(`Произошла ошибка при генерации портрета: ${error.message}`);
    } finally {
      setIsGeneratingPortrait(false);
    }
  };

  const handleClearPortrait = async () => {
    try {
      const response = await fetch(`${API_URL}/api/portrait/clear`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      });
      if (response.ok) {
        setPortraitData(null);
        WebApp.HapticFeedback.notificationOccurred('success');
      }
    } catch (error) {
      console.error(error);
    }
  };

  let markdownContent = portraitData ? portraitData.content : "";
  if (portraitData && markdownContent) {
    if (!markdownContent.includes("```json")) {
      // Find the raw array and wrap it in ```json ... ```
      markdownContent = markdownContent.replace(/(\[\s*\{[\s\S]*"leftValue"[\s\S]*\}\s*\])/, "```json\n$1\n```");
    }
  }

  const PortraitScale = ({ left, right, leftValue, rightValue }) => (
    <div className="mb-6">
      <div className="flex justify-between text-base sm:text-lg font-bold text-neutral-200 mb-3">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <div className="h-4 w-full bg-neutral-800 rounded-full overflow-hidden flex shadow-inner">
        <div className="h-full bg-blue-500 transition-all duration-1000 ease-out" style={{ width: `${leftValue}%` }}></div>
        <div className="h-full bg-orange-500 transition-all duration-1000 ease-out" style={{ width: `${rightValue}%` }}></div>
      </div>
    </div>
  );

  // Храним текущий раздел во время рендера Markdown
  const currentSectionRef = useRef("");

  const MarkdownComponents = {
    h1: ({node, ...props}) => (
      <h1 className="text-3xl sm:text-4xl font-black text-blue-400 text-center mb-10 mt-6 first:mt-2 uppercase drop-shadow-sm break-words" {...props} />
    ),
    h2: ({node, ...props}) => {
      let textStr = "";
      if (typeof props.children === 'string') textStr = props.children;
      else if (Array.isArray(props.children)) textStr = props.children.map(c => typeof c === 'string' ? c : '').join('');
      
      currentSectionRef.current = textStr; // Сохраняем текущий раздел

      let icon = null;
      if (textStr.includes('Устойчивые')) icon = <Activity className="text-blue-400 inline mb-1 mr-3" size={28} />;
      else if (textStr.includes('Поведенческие')) icon = <Brain className="text-emerald-400 inline mb-1 mr-3" size={28} />;
      else if (textStr.includes('ценностей')) icon = <Star className="text-amber-400 inline mb-1 mr-3" size={28} />;
      else if (textStr.includes('барьеры')) icon = <ShieldAlert className="text-red-400 inline mb-1 mr-3" size={28} />;
      else if (textStr.includes('Личность')) icon = <User className="text-blue-400 inline mb-1 mr-3" size={28} />;

      return <h2 className="text-2xl sm:text-3xl font-bold text-neutral-100 mt-14 mb-8 flex items-center justify-center border-b border-neutral-800/80 pb-4 break-words text-center">{icon} {props.children}</h2>
    },
    p: ({node, ...props}) => <p className="text-neutral-200 leading-relaxed mb-8 text-base sm:text-lg font-semibold text-left break-words" {...props} />,
    strong: ({node, ...props}) => {
      const section = currentSectionRef.current;
      let IconComponent = Sparkles;
      let iconColor = "text-blue-400";

      if (section.includes('Поведенческие')) {
        IconComponent = Target;
        iconColor = "text-emerald-400";
      } else if (section.includes('ценностей')) {
        IconComponent = Heart;
        iconColor = "text-amber-400";
      } else if (section.includes('барьеры')) {
        IconComponent = Flame;
        iconColor = "text-red-400";
      }

      return (
        <strong className="text-white font-black break-words" {...props}>
          <IconComponent className={`inline ${iconColor} mb-1 mr-1.5`} size={20} />
          {props.children}
        </strong>
      );
    },
    ul: ({node, ...props}) => <ul className="space-y-5 mb-10 mt-4 pl-2" {...props} />,
    li: ({node, ...props}) => (
      <li className="flex items-start text-base sm:text-lg font-medium text-neutral-300 break-words">
        <span className="text-blue-500 mr-3 mt-1.5 shrink-0">•</span>
        <span>{props.children}</span>
      </li>
    ),
    code: ({node, inline, className, children, ...props}) => {
      const match = /language-(\w+)/.exec(className || '')
      if (!inline && match && match[1] === 'json') {
        const jsonString = String(children).replace(/\n$/, '');
        let scalesData = [];
        try {
          scalesData = JSON.parse(jsonString);
        } catch (e) {
          return <code className={className} {...props}>{children}</code>;
        }
        return (
          <div className="my-10 px-2 sm:px-4">
            {scalesData.map((s, idx) => (
              <PortraitScale key={idx} left={s.left} right={s.right} leftValue={s.leftValue} rightValue={s.rightValue} />
            ))}
          </div>
        )
      }
      return <code className="bg-neutral-800 text-blue-300 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>
    }
  };

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

      {activeSubTab !== 'portrait' && (
        <>
          {/* 1.5. ПОРТРЕТ ЛИЧНОСТИ КНОПКА */}
          <div className="mx-4 mb-4">
            <button 
              onClick={() => setActiveSubTab('portrait')}
              className="w-full bg-gradient-to-r from-blue-900/30 to-blue-800/10 border border-blue-900/50 rounded-2xl p-4 text-left hover:bg-blue-900/40 transition-all duration-700 active:scale-[0.98] flex items-center justify-between"
            >
              <div>
                <h3 className="text-lg font-bold text-blue-400 mb-1">Мой портрет личности</h3>
                <p className="text-sm text-neutral-400">Узнайте свой портрет личности!</p>
              </div>
              <Wand2 className="text-blue-500" size={24} />
            </button>
          </div>

          {/* 2. ВКЛАДКИ */}
          <div className="flex border-b border-neutral-800 mb-4 mx-4">
            <button 
              onClick={() => setActiveSubTab('tests')}
              className={`flex-1 py-2 font-bold transition-colors duration-700 ${activeSubTab === 'tests' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              Тесты
            </button>
            <button 
              onClick={() => setActiveSubTab('analyses')}
              className={`flex-1 py-2 font-bold transition-colors duration-700 ${activeSubTab === 'analyses' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              Анализы
            </button>
          </div>
        </>
      )}

      {/* 3. КОНТЕНТ ВКЛАДОК */}
      {activeSubTab === 'tests' && (
        <div className="flex-1 overflow-y-auto px-2 pb-6 space-y-3 animate-in fade-in duration-700 flex flex-col">
          {loading ? (
            <div className="flex justify-center items-center py-12 flex-1">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
            </div>
          ) : categories.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-neutral-500 text-center py-12">
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
      )}

      {activeSubTab === 'analyses' && (
        <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 pb-12 animate-in fade-in duration-700 px-2 text-center">
          <p>Здесь будут ваши отчеты из раздела "Мои анализы".</p>
        </div>
      )}

      {activeSubTab === 'portrait' && (
        <div className="flex-1 overflow-y-auto px-4 pb-6 animate-in fade-in slide-in-from-right-8 duration-500 flex flex-col">
          <button 
            onClick={() => setActiveSubTab('tests')}
            className="flex items-center gap-2 text-neutral-400 hover:text-white mb-6 transition-colors self-start"
          >
            <ChevronLeft size={20} />
            <span className="font-medium">Назад</span>
          </button>
          
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 bg-blue-500/10 rounded-xl shrink-0 mt-1">
              <Wand2 className="text-blue-400" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-blue-400 mb-2 leading-tight">Мой портрет личности</h2>
              <p className="text-sm text-neutral-400 leading-relaxed">Узнайте свой портрет личности!</p>
            </div>
          </div>

          {isGeneratingPortrait ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-neutral-300 font-medium text-center">Портрет личности формируется...</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              {portraitData && portraitData.tests_count < totalTests && (
                <div className="mb-6 bg-neutral-900/60 border border-neutral-800 p-6 rounded-3xl text-center">
                  <p className="text-neutral-300 text-sm mb-4 font-medium">Добавлены новые тесты! После прохождения вы можете сформировать новый портрет личности</p>
                  {passedTests < totalTests ? (
                    <button disabled className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-neutral-800 text-neutral-500 font-bold border border-neutral-700 cursor-not-allowed">
                      <Lock size={18} /> Сформировать
                    </button>
                  ) : (
                    <button onClick={handleGeneratePortrait} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-colors active:scale-[0.98] shadow-lg shadow-blue-900/20">
                      <Wand2 size={18} /> Сформировать
                    </button>
                  )}
                </div>
              )}

              {portraitData && (
                <div className="px-1 sm:px-4 mb-4 overflow-x-hidden">
                  <ReactMarkdown components={MarkdownComponents}>
                    {markdownContent}
                  </ReactMarkdown>
                </div>
              )}

              {totalTests > 0 && passedTests < totalTests && !portraitData && (
                <div className="flex flex-col items-center text-center mt-auto bg-neutral-900/60 border border-neutral-800 p-6 rounded-3xl">
                  <p className="text-neutral-400 text-sm mb-6">Чтобы сформировать портрет личности, пройдите все тесты.</p>
                  <button disabled className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-neutral-800 text-neutral-500 font-bold border border-neutral-700 cursor-not-allowed">
                    <Lock size={18} /> Сформировать
                  </button>
                </div>
              )}

              {totalTests > 0 && passedTests === totalTests && !portraitData && (
                <div className="mt-auto">
                  <button onClick={handleGeneratePortrait} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-colors active:scale-[0.98] shadow-lg shadow-blue-900/20">
                    <Wand2 size={18} /> Сформировать
                  </button>
                </div>
              )}

              {portraitData && (
                <button 
                  onClick={handleClearPortrait}
                  className="mt-4 flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-red-900/10 text-red-400 hover:bg-red-900/30 border border-red-900/30 transition-colors font-medium text-sm"
                >
                  <Trash2 size={18} /> Очистить портрет (Test)
                </button>
              )}
            </div>
          )}
        </div>
      )}

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