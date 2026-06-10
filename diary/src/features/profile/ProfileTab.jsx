import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { User, ChevronDown, ChevronUp, CheckCircle, XCircle, X, ChevronLeft, Lock, Wand2, Trash2, Brain, Activity, Star, ShieldAlert, Sparkles, Target, Heart, Flame, ClipboardList, Users } from 'lucide-react';
import AdminPanel from '../admin/AdminPanel';
import FriendsView from './FriendsView';

const WebApp = window.Telegram.WebApp;
const API_URL = "https://friendly-various-near-across.trycloudflare.com";

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
    if (portraitData && portraitData.tests_count >= passedTests) {
      WebApp.showAlert("У вас нет новых пройденных тестов для обновления портрета.");
      return;
    }
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

  const PortraitScale = ({ left, right, leftValue, rightValue, description }) => (
    <div className="mb-10 w-full">
      <div className="flex justify-between text-base sm:text-lg font-bold text-[#F5E6D3] mb-3">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <div className="h-4 w-full bg-rose-800 rounded-full overflow-hidden flex shadow-inner mb-4">
        <div className="h-full bg-blue-500 transition-all duration-1000 ease-out" style={{ width: `${leftValue}%` }}></div>
        <div className="h-full bg-orange-500 transition-all duration-1000 ease-out" style={{ width: `${rightValue}%` }}></div>
      </div>
      {description && <div className="mt-4"><p className="text-sm sm:text-base text-[#F5E6D3] font-medium leading-relaxed block break-words whitespace-pre-wrap">{description}</p></div>}
    </div>
  );

  const getMarkdownComponents = (sectionTitle) => {
    let IconComponent = Sparkles;
    let iconColor = "text-[#F5E6D3]";

    if (sectionTitle.includes('Поведенческие')) {
      IconComponent = Target;
      iconColor = "text-[#F5E6D3]";
    } else if (sectionTitle.includes('ценностей')) {
      IconComponent = Heart;
      iconColor = "text-[#F5E6D3]";
    } else if (sectionTitle.includes('барьеры')) {
      IconComponent = Flame;
      iconColor = "text-[#F5E6D3]";
    }

    return {
      h1: ({node, ...props}) => (
        <h1 className="text-3xl sm:text-4xl font-black text-[#F5E6D3] text-center mb-10 mt-6 first:mt-2 uppercase drop-shadow-sm break-words" {...props} />
      ),
      h2: ({node, ...props}) => {
        let textStr = "";
        if (typeof props.children === 'string') textStr = props.children;
        else if (Array.isArray(props.children)) textStr = props.children.map(c => typeof c === 'string' ? c : '').join('');
        
        let h2Icon = null;
        if (textStr.includes('Устойчивые')) h2Icon = <Activity className="text-[#F5E6D3] inline mb-1 mr-3" size={28} />;
        else if (textStr.includes('Поведенческие')) h2Icon = <Brain className="text-[#F5E6D3] inline mb-1 mr-3" size={28} />;
        else if (textStr.includes('ценностей')) h2Icon = <Star className="text-[#F5E6D3] inline mb-1 mr-3" size={28} />;
        else if (textStr.includes('барьеры')) h2Icon = <ShieldAlert className="text-[#F5E6D3] inline mb-1 mr-3" size={28} />;
        else if (textStr.includes('Личность')) h2Icon = <User className="text-[#F5E6D3] inline mb-1 mr-3" size={28} />;

        return <h2 className="text-2xl sm:text-3xl font-bold text-[#F5E6D3] mt-14 mb-8 flex items-center justify-center pb-4 break-words text-center">{h2Icon} {props.children}</h2>
      },
      p: ({node, ...props}) => <p className="text-[#F5E6D3] leading-loose mb-8 text-base sm:text-lg font-semibold text-left break-words" {...props} />,
      strong: ({node, ...props}) => (
        <strong className="text-[#F5E6D3] font-black text-lg sm:text-xl break-words" {...props}>
          <IconComponent className={`inline ${iconColor} mb-1 mr-2`} size={22} />
          {props.children}
        </strong>
      ),
      ul: ({node, ...props}) => {
        return <ul className="space-y-6 mb-10 mt-6 pl-1 w-full" {...props} />
      },
      li: ({node, ...props}) => {
        const isBarriers = sectionTitle.includes('барьеры');
        return (
          <li className={`flex items-start text-base sm:text-lg font-semibold text-[#F5E6D3] break-words w-full ${isBarriers ? ' pb-4 last:' : ''}`}>
            <IconComponent className={`shrink-0 ${iconColor} mr-3 mt-1`} size={22} />
            <span className="flex-1 block">{props.children}</span>
          </li>
        );
      },
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
                <PortraitScale key={idx} left={s.left} right={s.right} leftValue={s.leftValue} rightValue={s.rightValue} description={s.description} />
              ))}
            </div>
          )
        }
        return <code className="bg-rose-800 text-[#F5E6D3] px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>
      }
    };
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
    <div className="flex flex-col relative select-none bg-transparent max-w-2xl mx-auto w-full">
      {/* 1. ШАПКА ПРОФИЛЯ (Аватар и Юзернейм) */}
      <div className="flex items-center gap-4 p-4 sm:p-6 bg-rose-900/80 rounded-3xl mx-2 mt-2 mb-4 backdrop-blur-sm shadow-sm">
        {tgUser.photo_url ? (
          <img src={tgUser.photo_url} alt="Avatar" className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover shadow-lg" />
        ) : (
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-900/40 text-[#F5E6D3] rounded-full flex items-center justify-center font-bold text-2xl shadow-inner">
            {tgUser.first_name?.[0] || <User size={32} />}
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <h2 className="text-xl sm:text-2xl font-bold text-[#F5E6D3] truncate">{tgUser.first_name}</h2>
          <p className="text-sm sm:text-base text-[#F5E6D3] font-medium truncate">@{tgUser.username}</p>
        </div>
        {['ingenfrid', 'key_crp', 'fondlife'].includes(tgUser.username) && (
          <button 
            onClick={() => setActiveSubTab('admin')}
            className="p-2 sm:px-4 sm:py-2 bg-blue-600 hover:bg-blue-500 text-[#F5E6D3] text-xs sm:text-sm font-bold rounded-xl transition-colors shadow-sm"
          >
            Админ-панель
          </button>
        )}
      </div>

      {activeSubTab === 'admin' && (
        <AdminPanel onBack={() => setActiveSubTab('tests')} />
      )}

      {activeSubTab === 'tests' && (
        <>
          {/* ПОРТРЕТ ЛИЧНОСТИ КНОПКИ */}
          <div className="mx-4 mb-4 flex flex-col gap-4">
            {!portraitData ? (
              <button 
                onClick={() => {
                  if (!(totalTests > 0 && passedTests === totalTests)) {
                    WebApp.showAlert("Пройдите все тесты, чтобы сформировать портрет личности.");
                    return;
                  }
                  handleGeneratePortrait();
                }}
                disabled={isGeneratingPortrait}
                className={`w-full rounded-2xl p-4 text-left transition-all duration-300 flex items-center justify-between ${
                  (totalTests > 0 && passedTests === totalTests) 
                    ? "bg-green-600 hover:bg-green-500 text-white active:scale-[0.98]" 
                    : "bg-rose-900/10 text-rose-900 opacity-90"
                }`}
              >
                <div>
                  <h3 className={`text-base sm:text-lg font-bold mb-1`}>Сформировать портрет</h3>
                  <p className={`text-xs sm:text-sm`}>
                    {isGeneratingPortrait ? 'Генерация...' : (totalTests > 0 && passedTests === totalTests) ? 'Анализ ваших тестов' : `Пройдено ${passedTests} из ${totalTests} тестов`}
                  </p>
                </div>
                {isGeneratingPortrait ? (
                  <div className="w-6 h-6 rounded-full animate-spin"></div>
                ) : (
                  <Wand2 size={24} />
                )}
              </button>
            ) : (
              <>
                {passedTests > portraitData.tests_count && (totalTests > 0 && passedTests === totalTests) && (
                  <button 
                    onClick={handleGeneratePortrait}
                    disabled={isGeneratingPortrait}
                    className="w-full bg-rose-900/10 rounded-2xl p-4 text-left hover:bg-rose-900/20 transition-all duration-300 active:scale-[0.98] flex items-center justify-between"
                  >
                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-rose-900 mb-1">Сформировать заново</h3>
                      <p className="text-xs sm:text-sm text-rose-800">{isGeneratingPortrait ? 'Генерация...' : 'Обновить на основе новых тестов'}</p>
                    </div>
                    {isGeneratingPortrait ? (
                      <div className="w-6 h-6 rounded-full animate-spin"></div>
                    ) : (
                      <Wand2 className="text-rose-900" size={24} />
                    )}
                  </button>
                )}
                <button 
                  onClick={() => setActiveSubTab('portrait')}
                  className="w-full bg-[#F5E6D3] border border-rose-900/20 rounded-2xl p-4 text-left hover:bg-[#EAE0D5] transition-all duration-300 active:scale-[0.98] flex items-center justify-between"
                >
                  <div>
                    <h3 className="text-lg font-bold text-rose-900 mb-1">Мой портрет</h3>
                    <p className="text-sm text-rose-800">Посмотреть результат</p>
                  </div>
                  <ClipboardList className="text-rose-900" size={24} />
                </button>
                <button 
                  onClick={() => setActiveSubTab('friends')}
                  className="w-full bg-[#F5E6D3] rounded-2xl p-4 text-left hover:bg-[#EAE0D5] transition-all duration-300 active:scale-[0.98] flex items-center justify-between"
                >
                  <div>
                    <h3 className="text-lg font-bold text-rose-900 mb-1">Друзья</h3>
                    <p className="text-sm text-rose-800">Узнайте совместимость с вашим другом или партнером!</p>
                  </div>
                  <Users className="text-rose-900" size={24} />
                </button>

              </>
            )}
          </div>

          {/* 3. КОНТЕНТ ВКЛАДОК (теперь только результаты) */}
        <div className="px-2 pb-6 space-y-3 animate-in fade-in duration-300 flex flex-col">
          {loading ? (
            <div className="flex justify-center items-center py-12 flex-1">
              <div className="animate-spin rounded-full h-10 w-10"></div>
            </div>
          ) : categories.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[#F5E6D3] text-center py-12">
              <p>Здесь будут ваши результаты тестов.</p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-[#F5E6D3] px-2 mt-2 mb-2">Результаты тестов</h2>
              {categories.map(cat => (
              <div key={cat.id} className="bg-rose-900 rounded-2xl overflow-hidden shadow-sm transition-all duration-300">
                {/* Кнопка категории (Аккордеон) */}
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

                {/* Содержимое категории (Список тестов) */}
                {openCategory === cat.id && (
                  <div className="bg-rose-950/40 px-4 py-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    {cat.tests.length === 0 ? (
                      <div className="text-[#F5E6D3] text-sm py-3 italic">В этой категории пока нет тестов.</div>
                    ) : (
                      cat.tests.map(test => (
                        <div
                          key={test.id}
                          onClick={() => openResultModal(test)}
                          className={`flex items-center justify-between py-3.5 last: 
                          ${ test.passed ? 'cursor-pointer hover:bg-rose-800/40 -mx-4 px-4 transition-colors active:bg-rose-800' : 'opacity-60 cursor-default' }`}
                        >
                          <span className="text-sm sm:text-base font-medium pr-3 text-[#F5E6D3] flex-1 leading-snug">
                            {test.name}
                          </span>
                          {/* Плашка Пройден / Не пройден */}
                          {test.passed ? (
                            <span className="flex items-center gap-1.5 text-green-500 text-[11px] sm:text-xs font-bold uppercase tracking-wider bg-emerald-500/10 px-2.5 py-1.5 rounded-lg whitespace-nowrap shrink-0">
                              <CheckCircle size={14} /> Пройден
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-red-400 text-[11px] sm:text-xs font-bold uppercase tracking-wider bg-red-400/10 px-2.5 py-1.5 rounded-lg whitespace-nowrap shrink-0">
                              <XCircle size={14} /> Не пройден
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
            </>
          )}
        </div>
        </>
      )}

      {activeSubTab === 'portrait' && (
        <div className="px-4 sm:px-6 pt-6 animate-in fade-in slide-in-from-right-8 duration-300 flex flex-col">
          <button 
            onClick={() => setActiveSubTab('tests')}
            className="flex items-center gap-2 text-[#F5E6D3] hover:text-[#F5E6D3] mb-6 transition-colors self-start"
          >
            <ChevronLeft size={20} />
            <span className="font-medium">Назад</span>
          </button>
          {/* Header block removed as requested */}

          {isGeneratingPortrait ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 mb-4"></div>
              <p className="text-[#F5E6D3] font-medium text-center">Портрет личности формируется...</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {portraitData && portraitData.tests_count < totalTests && (
                <div className="mb-6 bg-rose-900/80 p-6 rounded-3xl text-center">
                  <p className="text-[#F5E6D3] text-sm mb-4 font-medium">Добавлены новые тесты! После прохождения вы можете сформировать новый портрет личности</p>
                  {passedTests < totalTests ? (
                    <button disabled className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-rose-800 text-[#F5E6D3] font-bold cursor-not-allowed">
                      <Lock size={18} /> Мой портрет личности
                    </button>
                  ) : (
                    <button onClick={handleGeneratePortrait} className="w-full flex items-center justify-center gap-2 bg-green-800 hover:bg-green-700 text-[#F5E6D3] font-bold py-4 rounded-2xl transition-colors active:scale-[0.98] shadow-lg shadow-green-900/40">
                      <ClipboardList size={18} /> Мой портрет личности
                    </button>
                  )}
                </div>
              )}

              {portraitData && (
                <div className="bg-rose-900/80 rounded-3xl p-5 sm:p-8 mb-6 shadow-xl backdrop-blur-sm overflow-x-hidden">
                  {markdownContent.split(/(?=^#\s)/m).map((sectionText, i) => {
                    if (!sectionText.trim()) return null;
                    const firstLine = sectionText.trim().split('\n')[0];
                    return (
                      <ReactMarkdown key={i} components={getMarkdownComponents(firstLine)}>
                        {sectionText}
                      </ReactMarkdown>
                    );
                  })}
                </div>
              )}

              {totalTests > 0 && passedTests < totalTests && !portraitData && (
                <div className="flex flex-col items-center text-center mt-auto bg-rose-900/80 p-6 rounded-3xl">
                  <p className="text-[#F5E6D3] text-sm mb-6">Чтобы сформировать портрет личности, пройдите все тесты.</p>
                  <button disabled className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-rose-800 text-[#F5E6D3] font-bold cursor-not-allowed">
                    <Lock size={18} /> Мой портрет личности
                  </button>
                </div>
              )}

                {totalTests > 0 && passedTests === totalTests && !portraitData && (
                  <div className="mt-auto">
                    <button onClick={handleGeneratePortrait} className="w-full flex items-center justify-center gap-2 bg-green-800 hover:bg-green-700 text-[#F5E6D3] font-bold py-4 rounded-2xl transition-colors active:scale-[0.98] shadow-lg shadow-green-900/40">
                      <ClipboardList size={18} /> Мой портрет личности
                    </button>
                  </div>
                )}
  
              {portraitData && (
                <button 
                  onClick={handleClearPortrait}
                  className="mt-4 flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-red-900/10 text-[#F5E6D3] hover:bg-red-900/30 transition-colors font-medium text-sm active:scale-[0.98]"
                >
                  <Trash2 size={18} /> Удалить портрет
                </button>
              )}
              
            </div>
          )}
        </div>
      )}

      {/* 4. ВСПЛЫВАЮЩЕЕ ОКНО С РЕЗУЛЬТАТОМ ТЕСТА */}
      {selectedResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-rose-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          {/* Область клика вокруг окна для закрытия */}
          <div className="absolute inset-0" onClick={() => setSelectedResult(null)}></div>
          <div className="relative bg-rose-900 rounded-[2rem] w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300">
            {/* Заголовок модального окна */}
            <div className="p-5 sm:p-6 flex justify-between items-start">
              <div className="pr-4">
                <span className="text-[#F5E6D3] text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-1.5 block">
                  Результат тестирования
                </span>
                <h3 className="text-lg sm:text-xl font-bold text-[#F5E6D3] leading-tight">
                  {selectedResult.name}
                </h3>
              </div>
              <button onClick={() => setSelectedResult(null)} className="p-2 bg-rose-800/50 hover:bg-rose-800 rounded-xl text-[#F5E6D3] hover:text-[#F5E6D3] transition-colors hover: shrink-0">
                <X size={20} />
              </button>
            </div>
            {/* Текст результата */}
            <div className="p-5 sm:p-6 overflow-y-auto">
              <div className="text-[#F5E6D3] text-sm sm:text-base leading-relaxed whitespace-pre-wrap">
                {selectedResult.result_text || 'Нет детального описания результата.'}
              </div>
            </div>
            {/* Нижняя кнопка */}
            <div className="p-4 sm:p-5 bg-rose-950/50 rounded-b-[2rem]">
              <button onClick={() => setSelectedResult(null)} className="w-full bg-blue-600 hover:bg-blue-500 text-[#F5E6D3] font-bold py-3.5 rounded-xl transition-all active:bg-blue-700 shadow-lg shadow-blue-900/20">
                Отлично
              </button>
            </div>
          </div>
        </div>
      )}
    
      {activeSubTab === 'friends' && (
        <FriendsView onBack={() => setActiveSubTab('tests')} />
      )}
</div>
  );
}
