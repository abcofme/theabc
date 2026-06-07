import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday, setMonth, setYear, getYear, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronDown, X, Plus, BookOpen, Check, Trash2, Lock, Activity, Sparkles } from 'lucide-react';

const WebApp = window.Telegram.WebApp;
const API_URL = "https://friendly-various-near-across.trycloudflare.com";

export default function CalendarTab({ onSheetOpen }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [hasPortrait, setHasPortrait] = useState(false);
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
        const loadedEntries = data.map(entry => ({
          id: entry.id,
          date: new Date(entry.date),
          event: entry.event,
          reaction: entry.reaction,
          rating: entry.rating,
          portrait_match_score: entry.portrait_match_score
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
  );

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
                setDiaryEntries(prevEntries => prevEntries.map(e => e.id === data.id ? { ...e, portrait_match_score: analysisData.score } : e));
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
          setDiaryEntries(prevEntries => prevEntries.map(e => e.id === entryId ? { ...e, portrait_match_score: analysisData.score } : e));
        }
      })
      .catch(console.error)
      .finally(() => {
        setAnalyzingIds(prev => prev.filter(id => id !== entryId));
      });
  };

  const renderMatchScale = (entry) => {
    if (!hasPortrait) {
      return (
        <div className="mt-5 pt-5">
          <p className="text-xs font-bold text-white uppercase tracking-wider mb-3">Насколько реакция соответствует портрету?</p>
          <div className="h-2 w-full bg-rose-800 rounded-full overflow-hidden mb-2"></div>
          <p className="text-xs font-medium text-white flex items-center gap-1.5 leading-tight"><Lock size={12}/> Для разблокировки шкалы сформируйте портрет личности в профиле</p>
        </div>
      );
    }

    const isAnalyzing = analyzingIds.includes(entry.id);

    if (entry.portrait_match_score === null || entry.portrait_match_score === undefined) {
      return (
        <div className="mt-5 pt-5">
          <p className="text-xs font-bold text-white uppercase tracking-wider mb-3">Соответствие портрету личности:</p>
          {isAnalyzing ? (
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 bg-rose-800 rounded-full overflow-hidden relative">
                <div className="absolute inset-0 bg-rose-700 animate-pulse"></div>
              </div>
              <span className="text-xs text-white font-bold flex items-center gap-1"><Sparkles size={12}/> Анализ...</span>
            </div>
          ) : (
            <button onClick={() => handleManualAnalysis(entry.id)} className="w-full py-2 bg-rose-800 hover:bg-rose-700 text-white font-bold rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
              <Activity size={16} /> Проанализировать реакцию
            </button>
          )}
        </div>
      );
    }

    const score = entry.portrait_match_score;
    let colorClass = "bg-green-500";
    if (score <= 25) colorClass = "bg-red-500";
    else if (score <= 50) colorClass = "bg-orange-500";
    else if (score <= 75) colorClass = "bg-yellow-400";

    return (
      <div className="mt-5 pt-5">
        <p className="text-xs font-bold text-white uppercase tracking-wider mb-3">Соответствие портрету личности:</p>
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 bg-rose-800 rounded-full overflow-hidden shadow-inner relative">
            <div className={`absolute top-0 bottom-0 left-0 ${colorClass} transition-all duration-1000 ease-out`} style={{ width: `${score}%` }}></div>
          </div>
          <span className={`text-sm font-bold ${colorClass.replace('bg-', 'text-')}`}>{score}%</span>
        </div>
      </div>
    );
  };



  return (
    <div className="flex flex-col h-full relative select-none">
      {/* ШАПКА: ВЫБОР МЕСЯЦА И НАЗВАНИЕ ДНЕВНИКА */}
      <div className="mb-6 mt-2 relative flex items-center justify-between gap-2">
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center gap-2 text-lg sm:text-2xl font-bold text-white hover:text-white transition-colors bg-rose-900/60 px-3 sm:px-4 py-2 rounded-xl shrink-0"
        >
          <span className="capitalize">
            {format(currentMonth, 'LLLL yyyy', { locale: ru })}
          </span>
          <ChevronDown size={20} className={`transition-transform duration-700 ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Измененное название дневника */}
        <div className="text-white font-bold text-sm sm:text-base whitespace-nowrap text-right overflow-hidden text-ellipsis">
          Дневник @{tgUser.username || tgUser.first_name}
        </div>

        {isDropdownOpen && (
          <div className="absolute top-14 left-0 z-40 w-80 bg-rose-900 rounded-2xl shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-700">
            <div className="text-xs font-semibold text-white uppercase tracking-wider mb-2">Выберите месяц</div>
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {monthsRu.map((m, idx) => (
                <button
                  key={m}
                  onClick={() => {
                    setCurrentMonth(setMonth(currentMonth, idx));
                    setIsDropdownOpen(false);
                  }}
                  className={`py-2 text-sm rounded-xl transition-colors ${
                    currentMonth.getMonth() === idx ? 'bg-blue-600 text-white font-medium' : 'text-white hover:bg-rose-800'
                  }`}
                >
                  {m.substring(0, 3)}
                </button>
              ))}
            </div>

            <div className="text-xs font-semibold text-white uppercase tracking-wider mb-2">Выберите год</div>
            <div className="grid grid-cols-5 gap-1.5">
              {years.map(y => (
                <button
                  key={y}
                  onClick={() => {
                    setCurrentMonth(setYear(currentMonth, y));
                    setIsDropdownOpen(false);
                  }}
                  className={`py-1.5 text-xs rounded-lg transition-colors ${
                    getYear(currentMonth) === y ? 'bg-blue-600 text-white font-medium' : 'text-white hover:bg-rose-800'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* СЕТКА КАЛЕНДАРЯ */}
      <div className="flex-1 flex flex-col bg-rose-900/40 rounded-3xl p-3 backdrop-blur-sm overflow-hidden min-h-[400px]">
        <div className="grid grid-cols-7 mb-2 text-center">
          {weekDays.map(day => (
            <div key={day} className="text-xs font-semibold text-white uppercase py-2">
              {day}
            </div>
          ))}
        </div>
        <div className="flex-1 grid grid-cols-7 gap-1">
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
                className={`flex flex-col items-center justify-center p-2 rounded-2xl transition-all relative ${
                  isCurrentMonth
                    ? `bg-rose-900/60 text-white ${!isFutureDay && 'hover:bg-rose-800/80'}`
                    : `bg-transparent text-white ${!isFutureDay && 'hover:text-white'}`
                } ${
                  isDayToday ? '! !text-white bg-blue-950/20' : ''
                } ${
                  hasEntries && isCurrentMonth ? '!bg-emerald-500/20 ! !text-white font-bold' : ''
                } ${
                  isFutureDay ? 'opacity-40 cursor-default' : 'cursor-pointer'
                }`}
              >
                <span className={`text-base font-bold ${isDayToday ? 'scale-110' : ''}`}>
                  {format(date, 'd')}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ПОЛНОЭКРАННОЕ ОКНО С ЗАПИСЯМИ */}
      {isSheetOpen && (
        <div className="fixed inset-0 z-50 bg-rose-950 flex flex-col animate-in slide-in-from-bottom-8 duration-700">
          <div className="flex-1 w-full max-w-3xl mx-auto p-4 sm:p-6 flex flex-col overflow-y-auto">
            <div className="flex justify-between items-start mb-8 pt-4">
              <div>
                <h3 className="text-3xl font-bold text-white">
                  {selectedDate && format(selectedDate, 'd MMMM yyyy', { locale: ru })}
                </h3>
                <p className="text-sm text-white mt-1 uppercase tracking-wider font-medium text-white">
                  {selectedDate && format(selectedDate, 'EEEE', { locale: ru })}
                </p>
              </div>
              <button
                onClick={() => setIsSheetOpen(false)}
                className="p-2 bg-rose-900 hover:bg-rose-800 rounded-xl text-white hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 space-y-4 mb-8">
              {activeEntries.some(e => e.rating) ? (
                <div className="flex items-center justify-between gap-2 mb-4 bg-rose-900/40 p-4 rounded-2xl relative group">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-white uppercase tracking-wider">Оценка дня:</span>
                    <div className="flex gap-1 text-white text-xl">
                      {(() => {
                        const ratedEntry = activeEntries.find(e => e.rating);
                        return '?'.repeat(ratedEntry.rating) + '?'.repeat(5 - ratedEntry.rating);
                      })()}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDeleteRating(activeEntries.find(e => e.rating).id)}
                    className="p-2 text-white hover:text-white hover:bg-red-500/10 rounded-xl transition-colors active:scale-95"
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
                      className="absolute top-4 right-4 p-2 text-white hover:text-white hover:bg-red-500/10 rounded-xl transition-colors active:scale-95"
                    >
                      <Trash2 size={18} />
                    </button>
                    <div className="mb-4 pr-8">
                      <span className="text-xs font-bold text-white uppercase tracking-wider block mb-1.5">Событие:</span>
                      <p className="text-base text-white font-medium">{entry.event}</p>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white uppercase tracking-wider block mb-1.5">Реакция:</span>
                      <p className="text-base text-white">{entry.reaction}</p>
                    </div>
                    {renderMatchScale(entry)}
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 rounded-2xl text-white gap-3 mt-4">
                  <BookOpen size={40} className="text-white" />
                  <span className="text-lg">Записей пока нет</span>
                </div>
              )}
            </div>

            <form onSubmit={handleAddEntry} className=" pt-6 flex flex-col gap-6 mt-auto mb-safe pb-4">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Plus size={16} />
                Новая запись дневника
              </h4>
              
              <div className="flex flex-col gap-6">
                {newEntries.map((entry, index) => (
                  <div key={index} className="bg-rose-900/40 p-4 rounded-2xl flex flex-col gap-4 relative">
                    {newEntries.length > 1 && (
                      <div className="absolute -top-3 -right-2 bg-rose-800 text-white text-xs font-bold px-2 py-1 rounded-lg">
                        Событие {index + 1}
                      </div>
                    )}
                    <div>
                      <input
                        type="text"
                        placeholder="Что произошло? (Событие)"
                        value={entry.event}
                        onChange={(e) => updateEntry(index, 'event', e.target.value)}
                        className="w-full bg-rose-900 rounded-xl px-4 py-3.5 text-white placeholder:text-white focus:outline-none focus: focus:ring-1 focus:ring-blue-500/50 transition-all"
                      />
                    </div>
                    <div>
                      <textarea
                        placeholder="Моя реакция, чувства..."
                        value={entry.reaction}
                        onChange={(e) => updateEntry(index, 'reaction', e.target.value)}
                        rows="3"
                        className="w-full bg-rose-900 rounded-xl px-4 py-3.5 text-white placeholder:text-white focus:outline-none focus: focus:ring-1 focus:ring-blue-500/50 transition-all resize-none"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddMore}
                className="w-full bg-rose-800/80 hover:bg-rose-700 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <Plus size={18} />
                Добавить событие
              </button>

              {!hasDailyRating && (
                <div className="mt-4 pt-4">
                  <span className="text-sm font-bold text-white block mb-3">Оцените день по пятибальной шкале:</span>
                  <div className="flex justify-between gap-2">
                    {[1, 2, 3, 4, 5].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setNewRating(num)}
                        className={`flex-1 py-3 rounded-xl font-bold transition-all text-lg ${
                          newRating === num 
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30 scale-105' 
                            : 'bg-rose-900 text-white hover:bg-rose-800'
                        }`}
                      >
                        {newRating >= num ? '?' : '?'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitDisabled || isSubmitting}
                className="w-full bg-blue-600 disabled:bg-blue-900/40 disabled:text-white/50 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-blue-900/20"
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
            <h3 className="text-xl font-bold text-white mb-2 text-center">Удалить запись?</h3>
            <p className="text-white text-sm text-center mb-6">Эта запись будет навсегда удалена из вашего дневника.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setEntryToDelete(null)}
                className="flex-1 py-3 bg-rose-800 text-white font-bold rounded-2xl active:scale-95 transition-transform"
              >
                Нет
              </button>
              <button 
                onClick={handleDeleteEntry}
                className="flex-1 py-3 bg-red-500/20 text-white font-bold rounded-2xl active:scale-95 transition-transform"
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
