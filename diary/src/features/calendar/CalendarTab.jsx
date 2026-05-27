import React, { useState, useEffect } from 'react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isToday, 
  setMonth, 
  setYear,
  getYear,
  parseISO
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronDown, X, Plus, BookOpen, Check } from 'lucide-react';

const WebApp = window.Telegram.WebApp;
const API_URL = "http://89.19.216.208:8000";

export default function CalendarTab() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Начинаем с пустого массива, данные придут с сервера
  const [diaryEntries, setDiaryEntries] = useState([]);

  const [newEvent, setNewEvent] = useState('');
  const [newReaction, setNewReaction] = useState('');

  const monthsRu = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const years = [2024, 2025, 2026, 2027, 2028];

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const dayCells = eachDayOfInterval({ start: startDate, end: endDate });

  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const now = new Date();

  // === 1. ЗАГРУЗКА ДАННЫХ С СЕРВЕРА ПРИ СМЕНЕ МЕСЯЦА ===
  useEffect(() => {
    if (WebApp.initData) {
      const year = getYear(currentMonth);
      const month = currentMonth.getMonth() + 1; // getMonth возвращает 0-11
      
      fetch(`${API_URL}/api/diary?year=${year}&month=${month}`, {
        headers: {
          "Authorization": `Bearer ${WebApp.initData}`
        }
      })
      .then(res => res.json())
      .then(data => {
        // Преобразуем строковые даты из БД обратно в объекты Date
        const formattedData = data.map(entry => ({
          ...entry,
          date: parseISO(entry.date)
        }));
        setDiaryEntries(formattedData);
      })
      .catch(err => console.error("Ошибка загрузки дневника:", err));
    }
  }, [currentMonth]); // Перезапрашиваем при смене месяца

  const handleDayClick = (date) => {
    setSelectedDate(date);
    setIsSheetOpen(true);
  };

  // === 2. СОХРАНЕНИЕ НОВОЙ ЗАПИСИ НА СЕРВЕР ===
  const handleAddEntry = async (e) => {
    e.preventDefault();
    if (!newEvent.trim() || !newReaction.trim() || !selectedDate) return;

    // Форматируем дату для бэкенда (YYYY-MM-DD)
    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    try {
      const response = await fetch(`${API_URL}/api/diary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${WebApp.initData}`
        },
        body: JSON.stringify({
          date: dateStr,
          event: newEvent,
          reaction: newReaction
        })
      });

      if (response.ok) {
        const resData = await response.json();
        
        // Добавляем новую запись в локальный стейт, чтобы она сразу появилась на экране
        const newEntry = {
          id: resData.id,
          date: selectedDate,
          event: newEvent,
          reaction: newReaction
        };

        setDiaryEntries([...diaryEntries, newEntry]);
        setNewEvent('');
        setNewReaction('');
        WebApp.HapticFeedback.notificationOccurred('success'); // Небольшая вибрация в Telegram
      } else {
        WebApp.showAlert("Произошла ошибка при сохранении.");
      }
    } catch (error) {
      console.error("Ошибка сети:", error);
      WebApp.showAlert("Нет связи с сервером.");
    }
  };

  const activeEntries = diaryEntries.filter(entry => 
    selectedDate && isSameDay(entry.date, selectedDate)
  );

  return (
    <div className="flex flex-col h-full relative select-none">
      
      {/* ШАПКА: ВЫБОР МЕСЯЦА И НАЗВАНИЕ ДНЕВНИКА */}
      <div className="mb-6 mt-2 relative flex items-center justify-between gap-2">
        <button 
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center gap-2 text-lg sm:text-2xl font-bold text-neutral-100 hover:text-blue-400 transition-colors bg-neutral-900/60 px-3 sm:px-4 py-2 rounded-xl border border-neutral-800 shrink-0"
        >
          <span className="capitalize">
            {format(currentMonth, 'LLLL yyyy', { locale: ru })}
          </span>
          <ChevronDown size={20} className={`transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Измененное название дневника */}
        <div className="text-white font-bold text-sm sm:text-base whitespace-nowrap text-right overflow-hidden text-ellipsis">
          Личный дневник Азбука Я
        </div>

        {isDropdownOpen && (
          <div className="absolute top-14 left-0 z-40 w-80 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Выберите месяц</div>
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {monthsRu.map((m, idx) => (
                <button
                  key={m}
                  onClick={() => {
                    setCurrentMonth(setMonth(currentMonth, idx));
                    setIsDropdownOpen(false);
                  }}
                  className={`py-2 text-sm rounded-xl transition-colors ${
                    currentMonth.getMonth() === idx 
                      ? 'bg-blue-600 text-white font-medium' 
                      : 'text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  {m.substring(0, 3)}
                </button>
              ))}
            </div>

            <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Выберите год</div>
            <div className="grid grid-cols-5 gap-1.5">
              {years.map(y => (
                <button
                  key={y}
                  onClick={() => {
                    setCurrentMonth(setYear(currentMonth, y));
                    setIsDropdownOpen(false);
                  }}
                  className={`py-1.5 text-xs rounded-lg transition-colors ${
                    getYear(currentMonth) === y 
                      ? 'bg-blue-600 text-white font-medium' 
                      : 'text-neutral-400 hover:bg-neutral-800'
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
      <div className="flex-1 flex flex-col bg-neutral-900/40 border border-neutral-800/80 rounded-3xl p-3 backdrop-blur-sm overflow-hidden min-h-[400px]">
        <div className="grid grid-cols-7 mb-2 text-center">
          {weekDays.map(day => (
            <div key={day} className="text-xs font-semibold text-neutral-500 py-2 uppercase tracking-widest">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 flex-1 auto-rows-fr">
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
                className={`flex flex-col items-center justify-center p-2 rounded-2xl border transition-all relative ${
                  isCurrentMonth 
                    ? `bg-neutral-900/60 border-neutral-800/40 text-neutral-200 ${!isFutureDay && 'hover:bg-neutral-800/80'}` 
                    : `bg-transparent border-transparent text-neutral-600 ${!isFutureDay && 'hover:text-neutral-500'}`
                } ${
                  isDayToday ? '!border-blue-500/80 !text-blue-400 bg-blue-950/20' : ''
                } ${
                  isFutureDay ? 'opacity-40 cursor-default' : 'cursor-pointer'
                }`}
              >
                <span className={`text-base font-bold ${isDayToday ? 'scale-110' : ''}`}>
                  {format(date, 'd')}
                </span>

                {hasEntries && isCurrentMonth && (
                  <Check size={20} className="text-emerald-500 mt-1" strokeWidth={3} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ПОЛНОЭКРАННОЕ ОКНО С ЗАПИСЯМИ */}
      {isSheetOpen && (
        <div className="fixed inset-0 z-50 bg-neutral-950 flex flex-col animate-in slide-in-from-bottom-8 duration-300">
          <div className="flex-1 w-full max-w-3xl mx-auto p-4 sm:p-6 flex flex-col overflow-y-auto">
            
            <div className="flex justify-between items-start mb-8 pt-4">
              <div>
                <h3 className="text-3xl font-bold text-neutral-100">
                  {selectedDate && format(selectedDate, 'd MMMM yyyy', { locale: ru })}
                </h3>
                <p className="text-sm text-neutral-500 mt-1 uppercase tracking-wider font-medium text-blue-400">
                  {selectedDate && format(selectedDate, 'EEEE', { locale: ru })}
                </p>
              </div>
              <button 
                onClick={() => setIsSheetOpen(false)}
                className="p-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-xl text-neutral-400 hover:text-neutral-200 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 space-y-4 mb-8">
              {activeEntries.length > 0 ? (
                activeEntries.map(entry => (
                  <div key={entry.id} className="bg-neutral-900/80 border border-neutral-800 p-5 rounded-2xl shadow-inner">
                    <div className="mb-4">
                      <span className="text-xs font-bold text-amber-500/90 uppercase tracking-wider block mb-1.5">Событие:</span>
                      <p className="text-base text-neutral-200 font-medium">{entry.event}</p>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-blue-400 uppercase tracking-wider block mb-1.5">Реакция:</span>
                      <p className="text-base text-neutral-300 italic">«{entry.reaction}»</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 border border-dashed border-neutral-800 rounded-2xl text-neutral-500 gap-3 mt-4">
                  <BookOpen size={40} className="text-neutral-600" />
                  <span className="text-lg">Записей пока нет</span>
                </div>
              )}
            </div>

            <form onSubmit={handleAddEntry} className="border-t border-neutral-900 pt-6 flex flex-col gap-4 mt-auto mb-safe">
              <h4 className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                <Plus size={16} /> Новая запись дневника
              </h4>
              
              <div>
                <input 
                  type="text" 
                  placeholder="Что произошло? (Событие)" 
                  value={newEvent}
                  onChange={(e) => setNewEvent(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-5 py-3.5 text-base text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <textarea 
                  placeholder="Ваша реакция / мысли" 
                  value={newReaction}
                  onChange={(e) => setNewReaction(e.target.value)}
                  rows="3"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-5 py-3.5 text-base text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                />
              </div>

              <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white py-4 rounded-xl font-medium text-lg transition-colors shadow-lg shadow-blue-900/20 mt-2"
              >
                Сохранить запись
              </button>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}