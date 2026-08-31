import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday, setMonth, setYear, getYear, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronDown, X, Plus, BookOpen, Check, Trash2, Lock, Activity, Sparkles } from 'lucide-react';
import logo from '../../assets/logo.png';

const WebApp = window.Telegram.WebApp;
const API_URL = window.location.origin;

export default function CalendarTab({ onSheetOpen }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [hasPortrait, setHasPortrait] = useState(false);
  const [accessLevel, setAccessLevel] = useState('Free');
  const [analyzingIds, setAnalyzingIds] = useState([]);

  // Загружаем наличие портрета
  useEffect(() => {
    fetch(`${API_URL}/api/profile`, {
      headers: {
        "Authorization": `Bearer ${WebApp.initData}`
      }
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.portrait) {
          setHasPortrait(true);
        }
        if (data && data.access_level) {
          setAccessLevel(data.access_level);
        }
      })
      .catch(console.error);
  }, []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState(null);
  
  // Начинаем с пустого массива, данные придут с сервера
  const [diaryEntries, setDiaryEntries] = useState([]);
  const [newEntries, setNewEntries] = useState([{ event: '', reaction: '' }]);
  const [newRating, setNewRating] = useState(0);

  const tgUser = WebApp.initDataUnsafe?.user || {
    first_name: "Пользователь",
    username: "username"
  };

  const monthsRu = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const years = [2024, 2025, 2026, 2027, 2028];
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const dayCells = eachDayOfInterval({ start: startDate, end: endDate });
  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const now = new Date();

  // Добавленный хук для скрытия/показа меню
  useEffect(() => {
    if (onSheetOpen) {
      onSheetOpen(isSheetOpen);
    }
  }, [isSheetOpen, onSheetOpen]);

  // === 1. ЗАГРУЗКА ДАННЫХ С СЕРВЕРА ===
  useEffect(() => {
    if (!WebApp.initData) return;

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth() + 1; // 1-12

    fetch(`${API_URL}/api/diary?year=${year}&month=${month}`, {
      headers: { "Authorization": `Bearer ${WebApp.initData}` }
    })
      .then(res => res.json())
      .then(data => {
        if (!Array.isArray(data)) {
          console.error("Calendar data error:", data);
          return;
        }
        const loadedEntries = data.map(entry => ({
          id: entry.id,
          date: new Date(entry.date),
          event: entry.event,
          reaction: entry.reaction,
          rating: entry.rating,
          portrait_match_score: entry.portrait_match_score,
          portrait_match_explanation: entry.portrait_match_explanation
        }));
        setDiaryEntries(loadedEntries);
      })
      .catch(err => console.error("Ошибка загрузки дневника:", err));
  }, [currentMonth]);

  const handleDayClick = (date) => {
    if (date > now) return;
    setSelectedDate(date);
    setIsSheetOpen(true);
    setNewEntries([{ event: '', reaction: '' }]);
    setNewRating(0);
  };

  const updateEntry = (index, field, value) => {
    const updated = [...newEntries];
    updated[index][field] = value;
    setNewEntries(updated);
  };

  const handleAddMore = () => {
    setNewEntries([...newEntries, { event: '', reaction: '' }]);
  };

  const activeEntries = diaryEntries.filter(entry =>
    selectedDate && isSameDay(entry.date, selectedDate)
  ).sort((a, b) => a.id - b.id);

  const hasDailyRating = activeEntries.some(e => e.rating);

  const handleAddEntry = async (e) => {
    e.preventDefault();
    if (newEntries.some(entry => !entry.event.trim() || !entry.reaction.trim())) {
      WebApp.showAlert("Пожалуйста, заполните все события и реакции.");
      return;
    }
    
    setIsSubmitting(true);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    
    try {
      // Сохраняем все записи последовательно
      for (const entry of newEntries) {
        const response = await fetch(`${API_URL}/api/diary`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${WebApp.initData}`
          },
          body: JSON.stringify({
            date: dateStr,
            event: entry.event,
            reaction: entry.reaction,
            rating: hasDailyRating ? null : newRating
          })
        });

        if (!response.ok) {
          throw new Error("Ошибка сохранения");
        }
        
        const data = await response.json();
        // Добавляем новую запись в локальный стейт, чтобы она отобразилась мгновенно
        setDiaryEntries(prev => [...prev, {
          id: data.id,
          date: selectedDate,
          event: entry.event,
          reaction: entry.reaction,
          rating: newRating,
          portrait_match_score: null
        }]);

        if (hasPortrait) {
          setAnalyzingIds(prev => [...prev, data.id]);
          fetch(`${API_URL}/api/analyze-reaction/${data.id}`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${WebApp.initData}`
            }
          })
            .then(res => res.json())
            .then(analysisData => {
              if (analysisData.status === "success") {
                setDiaryEntries(prevEntries => prevEntries.map(e => e.id === data.id ? { ...e, portrait_match_score: analysisData.score, portrait_match_explanation: analysisData.explanation } : e));
              }
            })
            .catch(console.error)
            .finally(() => {
              setAnalyzingIds(prev => prev.filter(id => id !== data.id));
            });
        }
      }
      
      // Сбрасываем форму
      setNewEntries([{ event: '', reaction: '' }]);
      setNewRating(0);
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch (error) {
      console.error(error);
      WebApp.showAlert("Произошла ошибка при сохранении. Возможно, не все записи сохранены.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEntry = async () => {
    if (!entryToDelete) return;
    
    try {
      const response = await fetch(`${API_URL}/api/diary/${entryToDelete.id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${WebApp.initData}`
        }
      });
      
      if (!response.ok) throw new Error("Ошибка удаления");
      
      setDiaryEntries(prev => prev.filter(e => e.id !== entryToDelete.id));
      setEntryToDelete(null);
    } catch (error) {
      console.error(error);
      WebApp.showAlert("Произошла ошибка при удалении.");
    }
  };

  const isSubmitDisabled = newEntries.some(ent => !ent.event.trim() || !ent.reaction.trim());

  const handleDeleteRating = async (entryId) => {
    try {
      const response = await fetch(`${API_URL}/api/diary/${entryId}/rating`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${WebApp.initData}`
        }
      });
      if (!response.ok) throw new Error("Ошибка удаления оценки");
      setDiaryEntries(prev => prev.map(e => e.id === entryId ? { ...e, rating: null } : e));
    } catch (error) {
      console.error(error);
      WebApp.showAlert("Произошла ошибка при удалении оценки.");
    }
  };

  const handleManualAnalysis = (entryId) => {
    if (!hasPortrait) return;
    setAnalyzingIds(prev => [...prev, entryId]);
    fetch(`${API_URL}/api/analyze-reaction/${entryId}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WebApp.initData}`
      }
    })
      .then(res => res.json())
      .then(analysisData => {
        if (analysisData.status === "success") {
          setDiaryEntries(prevEntries => prevEntries.map(e => e.id === entryId ? { ...e, portrait_match_score: analysisData.score, portrait_match_explanation: analysisData.explanation } : e));
        }
      })
      .catch(console.error)
      .finally(() => {
        setAnalyzingIds(prev => prev.filter(id => id !== entryId));
      });
  };

  const AnalysisProgressBar = () => {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
      let start = null;
      let duration = 1000; // 1 second for one way
      let animationFrameId;

      const step = (timestamp) => {
        if (!start) start = timestamp;
        const elapsed = timestamp - start;
        
        const cycleElapsed = elapsed % (duration * 2);
        
        let currentProgress;
        if (cycleElapsed < duration) {
          currentProgress = (cycleElapsed / duration) * 100;
        } else {
          currentProgress = 100 - ((cycleElapsed - duration) / duration) * 100;
        }
        
        setProgress(currentProgress);
        animationFrameId = window.requestAnimationFrame(step);
      };
      
      animationFrameId = window.requestAnimationFrame(step);
      return () => window.cancelAnimationFrame(animationFrameId);
    }, []);

    let colorClass = "bg-emerald-800";
    if (progress <= 25) colorClass = "bg-red-500";
    else if (progress <= 50) colorClass = "bg-orange-500";
    else if (progress <= 75) colorClass = "bg-yellow-400";
    
    const textColorClass = 'text-[#F5E6D3]';

    return (
      <div className="flex items-center gap-3 w-full">
        <div className="h-2 flex-1 bg-rose-800 rounded-full overflow-hidden shadow-inner relative">
          <div 
            className={`h-full ${colorClass}`}
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <span className={`text-xs font-bold min-w-[4ch] ${textColorClass}`}>{Math.floor(progress)}%</span>
      </div>
    );
  };

  const AnimatedMatchScale = ({ score, colorClass }) => {
    const [animatedScore, setAnimatedScore] = useState(0);

    useEffect(() => {
      const startTimer = setTimeout(() => {
        let start = null;
        const duration = 1500;

        const step = (timestamp) => {
          if (!start) start = timestamp;
          const progress = Math.min((timestamp - start) / duration, 1);
          const easeOut = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
          
          setAnimatedScore(score * easeOut);

          if (progress < 1) {
            window.requestAnimationFrame(step);
          } else {
            setAnimatedScore(score);
          }
        };
        window.requestAnimationFrame(step);
      }, 100);

      return () => clearTimeout(startTimer);
    }, [score]);

    const textColorClass = 'text-[#F5E6D3]';

    return (
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 bg-rose-800 rounded-full overflow-hidden shadow-inner relative">
          <div className={`absolute top-0 bottom-0 left-0 ${colorClass}`} style={{ width: `${animatedScore}%` }}></div>
        </div>
        <span className={`text-sm font-bold ${textColorClass}`}>{Math.round(animatedScore)}%</span>
      </div>
    );
  };

  const renderMatchScale = (entry) => {
    if (accessLevel === 'Free') {
      return (
        <div className="mt-5 pt-5">
          <p className="text-xs font-bold text-[#F5E6D3] uppercase tracking-wider mb-3">Соответствие портрету личности:</p>
          <div className="h-2 w-full bg-rose-800 rounded-full overflow-hidden mb-2"></div>
          <p className="text-xs font-medium text-[#F5E6D3] flex items-center gap-1.5 leading-tight"><Lock size={12} /> Доступно с Premium</p>
        </div>
      );
    }

    if (!hasPortrait) {
      return (
        <div className="mt-5 pt-5">
          <p className="text-xs font-bold text-[#F5E6D3] uppercase tracking-wider mb-3">Насколько реакция соответствует портрету?</p>
          <div className="h-2 w-full bg-rose-800 rounded-full overflow-hidden mb-2"></div>
          <p className="text-xs font-medium text-[#F5E6D3] flex items-center gap-1.5 leading-tight"><Lock size={12}/> Для разблокировки шкалы сформируйте портрет личности в профиле</p>
        </div>
      );
    }

    const isAnalyzing = analyzingIds.includes(entry.id);

    if (entry.portrait_match_score === null || entry.portrait_match_score === undefined) {
      return (
        <div className="mt-5 pt-5">
          <p className="text-xs font-bold text-[#F5E6D3] uppercase tracking-wider mb-3">Соответствие портрету личности:</p>
          {isAnalyzing ? (
              <AnalysisProgressBar />
          ) : (
            <button onClick={() => handleManualAnalysis(entry.id)} className="w-full py-2 bg-rose-800 hover:bg-rose-700 text-[#F5E6D3] font-bold rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
              <Activity size={16} /> Проанализировать реакцию
            </button>
          )}
        </div>
      );
    }

    const score = entry.portrait_match_score;
    let colorClass = "bg-emerald-800";
    if (score <= 25) colorClass = "bg-red-500";
    else if (score <= 50) colorClass = "bg-orange-500";
    else if (score <= 75) colorClass = "bg-yellow-400";

    return (
      <div className="mt-5 pt-5">
        <p className="text-xs font-bold text-[#F5E6D3] uppercase tracking-wider mb-3">Соответствие портрету личности:</p>
        <AnimatedMatchScale score={score} colorClass={colorClass} />
        {entry.portrait_match_explanation && (
          <div className="mt-4 p-3 bg-rose-900/50 rounded-xl relative overflow-hidden">
            <div className={`absolute left-0 top-0 bottom-0 w-2 ${colorClass}`}></div>
            <p className="text-sm text-[#F5E6D3]/90 italic leading-relaxed pl-3">
              "{entry.portrait_match_explanation}"
            </p>
          </div>
        )}
      </div>
    );
  };



  return (
    <div className="flex flex-col flex-1 h-full w-full relative select-none">
      {/* ШАПКА: ВЫБОР МЕСЯЦА И НАЗВАНИЕ ДНЕВНИКА */}
      <div className="mb-6 mt-2 relative flex items-center justify-between gap-1 sm:gap-2">
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="relative z-10 flex items-center gap-1 sm:gap-2 text-base sm:text-2xl font-bold text-[#F5E6D3] hover:text-[#F5E6D3] transition-colors bg-rose-900/80 px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl shrink-0"
        >
          <span className="capitalize">
            {format(currentMonth, 'LLL yyyy', { locale: ru })}
          </span>
          <ChevronDown size={18} className={`transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Правая часть: логотип и юзернейм */}
        <div className="relative z-10 flex items-center gap-2 shrink-0 justify-end">
          <img src={logo} alt="Азбука Я" className="h-8 sm:h-10 object-contain drop-shadow-md" />
          <div className="text-[#F5E6D3] font-bold text-base sm:text-2xl whitespace-nowrap overflow-hidden text-ellipsis max-w-[90px] sm:max-w-[150px]">
            @{tgUser.username || tgUser.first_name}
          </div>
        </div>

        {isDropdownOpen && (
          <div className="absolute top-14 left-0 z-40 w-[calc(100vw-2rem)] sm:w-80 max-w-[320px] bg-rose-900 rounded-2xl shadow-2xl p-4 animate-slide-down overflow-hidden">
            <div className="text-xs font-semibold text-[#F5E6D3] uppercase tracking-wider mb-2">Выберите месяц</div>
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {monthsRu.map((m, idx) => (
                <button
                  key={m}
                  onClick={() => {
                    setCurrentMonth(setMonth(currentMonth, idx));
                    setIsDropdownOpen(false);
                  }}
                  className={`py-2 text-sm rounded-xl transition-colors ${
                    currentMonth.getMonth() === idx ? 'bg-emerald-800 text-[#F5E6D3] font-medium' : 'text-[#F5E6D3] hover:bg-rose-800'
                  }`}
                >
                  {m.substring(0, 3)}
                </button>
              ))}
            </div>

            <div className="text-xs font-semibold text-[#F5E6D3] uppercase tracking-wider mb-2">Выберите год</div>
            <div className="grid grid-cols-5 gap-1.5">
              {years.map(y => (
                <button
                  key={y}
                  onClick={() => {
                    setCurrentMonth(setYear(currentMonth, y));
                    setIsDropdownOpen(false);
                  }}
                  className={`py-1.5 text-xs rounded-lg transition-colors ${
                    getYear(currentMonth) === y ? 'bg-emerald-800 text-[#F5E6D3] font-medium' : 'text-[#F5E6D3] hover:bg-rose-800'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* СЕТКА КАЛЕНДАРЯ И ТЕКСТ */}
      <div className="flex-1 flex flex-col gap-4 sm:gap-6 overflow-hidden">
        <div className="flex-1 flex flex-col bg-rose-900/40 rounded-3xl p-2 sm:p-3 backdrop-blur-sm overflow-hidden min-h-0">
          <div className="grid grid-cols-7 mb-1 sm:mb-2 text-center shrink-0">
            {weekDays.map(day => (
              <div key={day} className="text-[10px] sm:text-xs font-semibold text-[#F5E6D3] uppercase py-1 sm:py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="flex-1 grid grid-cols-7 auto-rows-fr gap-1">
            {dayCells.map((date, index) => {
              const isCurrentMonth = isSameMonth(date, currentMonth);
              const isDayToday = isToday(date);
              const hasEntries = diaryEntries.some(e => isSameDay(e.date, date));
              const isFutureDay = date > now;

              return (
                <button
                  key={index}
                  onClick={() => handleDayClick(date)}
                  disabled={isFutureDay}
                  className={`flex flex-col items-center justify-center p-1 sm:p-2 rounded-xl sm:rounded-2xl transition-all relative h-full w-full ${
                    isCurrentMonth
                      ? `bg-rose-900/80 text-[#F5E6D3] ${!isFutureDay && 'hover:bg-rose-800/80'}`
                      : `bg-transparent text-[#F5E6D3] ${!isFutureDay && 'hover:text-[#F5E6D3]'}`
                  } ${
                    isDayToday ? '! !text-[#F5E6D3] bg-blue-950/20' : ''
                  } ${
                    hasEntries && isCurrentMonth ? '!bg-emerald-800/40 ! !text-[#F5E6D3] font-bold' : ''
                  } ${
                    isFutureDay ? 'opacity-40 cursor-default' : 'cursor-pointer'
                  }`}
                >
                  <span className={`text-sm sm:text-base font-bold ${isDayToday ? 'scale-110' : ''}`}>
                    {format(date, 'd')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ТЕКСТ ПОД КАЛЕНДАРЕМ */}
        <div className="shrink-0 flex items-center justify-center px-2 sm:px-4 py-1 mb-2">
          <p className="text-[#F5E6D3] font-bold text-center text-sm sm:text-base leading-relaxed drop-shadow-md">
            Говорящий личный дневник знает твою силу и слабости. Видит тебя без искажений. Обсуди с ним что произошло сегодня, он ответит.
          </p>
        </div>
      </div>

      {/* ПОЛНОЭКРАННОЕ ОКНО С ЗАПИСЯМИ */}
      {isSheetOpen && (
        <div className="fixed inset-0 z-50 bg-rose-950 flex flex-col animate-in slide-in-from-bottom-8 duration-300">
          <div className="flex-1 w-full max-w-3xl mx-auto p-4 sm:p-6 flex flex-col overflow-y-auto">
            <div className="flex justify-between items-start mb-8 pt-4">
              <div className="min-w-0 flex-1">
                <h3 className="text-3xl font-bold text-[#F5E6D3] truncate">
                  {selectedDate && format(selectedDate, 'd MMMM yyyy', { locale: ru })}
                </h3>
                <p className="text-sm text-[#F5E6D3] mt-1 uppercase tracking-wider font-medium text-[#F5E6D3]">
                  {selectedDate && format(selectedDate, 'EEEE', { locale: ru })}
                </p>
              </div>
              <button
                onClick={() => setIsSheetOpen(false)}
                className="p-2 bg-rose-900 hover:bg-rose-800 rounded-xl text-[#F5E6D3] hover:text-[#F5E6D3] transition-colors shrink-0 ml-4"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 space-y-4 mb-8">
              {activeEntries.some(e => e.rating) ? (
                <div className="flex items-center justify-between gap-2 mb-4 bg-rose-900/40 p-4 rounded-2xl relative group">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-[#F5E6D3] uppercase tracking-wider">Оценка дня:</span>
                    <div className="flex gap-1 text-[#F5E6D3] text-xl">
                      {(() => {
                        const ratedEntry = activeEntries.find(e => e.rating);
                        return '★'.repeat(ratedEntry.rating) + '☆'.repeat(5 - ratedEntry.rating);
                      })()}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDeleteRating(activeEntries.find(e => e.rating).id)}
                    className="p-2 text-[#F5E6D3] hover:text-[#F5E6D3] hover:bg-red-500/10 rounded-xl transition-colors active:scale-95"
                    title="Удалить оценку дня"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ) : null}
              {activeEntries.length > 0 ? (
                activeEntries.map(entry => (
                  <div key={entry.id} className="bg-rose-900/80 p-5 rounded-2xl shadow-inner relative">
                    <button 
                      onClick={() => setEntryToDelete(entry)}
                      className="absolute top-4 right-4 p-2 text-[#F5E6D3] hover:text-[#F5E6D3] hover:bg-red-500/10 rounded-xl transition-colors active:scale-95"
                    >
                      <Trash2 size={18} />
                    </button>
                    <div className="mb-4 pr-8">
                      <span className="text-xs font-bold text-[#F5E6D3] uppercase tracking-wider block mb-1.5">Событие:</span>
                      <p className="text-base text-[#F5E6D3] font-medium">{entry.event}</p>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-[#F5E6D3] uppercase tracking-wider block mb-1.5">Реакция:</span>
                      <p className="text-base text-[#F5E6D3]">{entry.reaction}</p>
                    </div>
                    {renderMatchScale(entry)}
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 rounded-2xl text-[#F5E6D3] gap-3 mt-4">
                  <BookOpen size={40} className="text-[#F5E6D3]" />
                  <span className="text-lg">Записей пока нет</span>
                </div>
              )}
            </div>

            <form onSubmit={handleAddEntry} className=" pt-6 flex flex-col gap-6 mt-auto mb-safe pb-4">
              <h4 className="text-sm font-bold text-[#F5E6D3] uppercase tracking-wider flex items-center gap-2">
                <Plus size={16} />
                Новая запись дневника
              </h4>
              
              <div className="flex flex-col gap-6">
                {newEntries.map((entry, index) => (
                  <div key={index} className="bg-rose-900/40 p-4 rounded-2xl flex flex-col gap-4 relative">
                    {newEntries.length > 1 && (
                      <div className="absolute -top-3 -right-2 bg-rose-800 text-[#F5E6D3] text-xs font-bold px-2 py-1 rounded-lg">
                        Событие {index + 1}
                      </div>
                    )}
                    <div>
                      <input
                        type="text"
                        placeholder="Что произошло? (Событие)"
                        value={entry.event}
                        onChange={(e) => updateEntry(index, 'event', e.target.value)}
                        className="w-full bg-rose-900 rounded-xl px-4 py-3.5 text-[#F5E6D3] placeholder:text-[#F5E6D3] focus:outline-none focus:ring-2 focus:ring-emerald-700 transition-all"
                      />
                    </div>
                    <div>
                      <textarea
                        placeholder="Моя реакция, чувства..."
                        value={entry.reaction}
                        onChange={(e) => updateEntry(index, 'reaction', e.target.value)}
                        rows="3"
                        className="w-full bg-rose-900 rounded-xl px-4 py-3.5 text-[#F5E6D3] placeholder:text-[#F5E6D3] focus:outline-none focus:ring-2 focus:ring-emerald-700 transition-all resize-none"
                      />
                    </div>
                  </div>
                ))}
              </div>


              {!hasDailyRating && (
                <div className="mt-4 pt-4">
                  <span className="text-sm font-bold text-[#F5E6D3] block mb-3">Оцените день по пятибальной шкале:</span>
                  <div className="flex justify-between gap-2">
                    {[1, 2, 3, 4, 5].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setNewRating(num)}
                        className={`flex-1 py-3 rounded-xl font-bold transition-all text-lg ${
                          newRating === num 
                            ? 'bg-emerald-800 text-[#F5E6D3] shadow-lg shadow-emerald-950/30 scale-105' 
                            : 'bg-rose-900 text-[#F5E6D3] hover:bg-rose-800'
                        }`}
                      >
                        {newRating >= num ? '★' : '☆'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitDisabled || isSubmitting}
                className="w-full bg-emerald-800 disabled:bg-emerald-950/40 disabled:text-[#F5E6D3]/50 hover:bg-emerald-800 text-[#F5E6D3] font-bold py-4 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-emerald-950/20"
              >
                {isSubmitting ? 'Сохранение...' : `Сохранить ${newEntries.length > 1 ? 'все записи' : 'запись'}`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* МОДАЛКА УДАЛЕНИЯ ЗАПИСИ */}
      {entryToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-rose-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-rose-900 p-6 rounded-3xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-300">
            <h3 className="text-xl font-bold text-[#F5E6D3] mb-2 text-center">Удалить запись?</h3>
            <p className="text-[#F5E6D3] text-sm text-center mb-6">Эта запись будет навсегда удалена из вашего дневника.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setEntryToDelete(null)}
                className="flex-1 py-3 bg-rose-800 text-[#F5E6D3] font-bold rounded-2xl active:scale-95 transition-transform"
              >
                Нет
              </button>
              <button 
                onClick={handleDeleteEntry}
                className="flex-1 py-3 bg-red-500/20 text-[#F5E6D3] font-bold rounded-2xl active:scale-95 transition-transform"
              >
                Да
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
