import { useState, useEffect } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, addMonths, subMonths } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Page from '../../components/Page';
import { dayKey } from './utils';

const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// Полный календарь — теперь навигация по прошлым дням, а не главный экран
export default function MonthSheet({ today, daysWithEntries, onLoadMonth, onSelectDay, onClose }) {
  const [month, setMonth] = useState(() => startOfMonth(parseISO(today)));
  const [isLoading, setIsLoading] = useState(true);
  const isCurrentMonth = isSameMonth(month, parseISO(today));

  useEffect(() => {
    let cancelled = false;
    onLoadMonth(month.getFullYear(), month.getMonth() + 1)
      .catch(err => console.error('Ошибка загрузки месяца:', err))
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [month, onLoadMonth]);

  const changeMonth = (next) => {
    setIsLoading(true);
    setMonth(next);
  };

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });

  return (
    <Page title="Календарь" onBack={onClose}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => changeMonth(subMonths(month, 1))} aria-label="Предыдущий месяц" className="p-2 bg-rose-900 rounded-xl text-[#F5E6D3]">
          <ChevronLeft size={20} />
        </button>
        <span className={`text-lg font-bold text-[#F5E6D3] capitalize ${isLoading ? 'opacity-60' : ''}`}>
          {format(month, 'LLLL yyyy', { locale: ru })}
        </span>
        <button
          onClick={() => changeMonth(addMonths(month, 1))}
          disabled={isCurrentMonth}
          aria-label="Следующий месяц"
          className="p-2 bg-rose-900 rounded-xl text-[#F5E6D3] disabled:opacity-30"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="bg-rose-900/40 rounded-3xl p-2">
        <div className="grid grid-cols-7 mb-1 text-center">
          {weekDays.map(day => (
            <div key={day} className="text-xs font-semibold text-[#F5E6D3]/70 uppercase py-1">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map(date => {
            const key = dayKey(date);
            const inMonth = isSameMonth(date, month);
            const isToday = key === today;
            const isFuture = key > today;
            const hasEntries = daysWithEntries.has(key);
            return (
              <button
                key={key}
                disabled={isFuture}
                onClick={() => onSelectDay(key)}
                className={`aspect-square flex items-center justify-center rounded-xl text-sm font-bold ${
                  !inMonth ? 'text-[#F5E6D3]/40' : hasEntries ? 'bg-emerald-800/60 text-[#F5E6D3]' : 'bg-rose-900/80 text-[#F5E6D3]'
                } ${isToday ? 'ring-2 ring-[#F5E6D3]' : ''} ${isFuture ? 'opacity-30' : 'active:scale-95'}`}
              >
                {format(date, 'd')}
              </button>
            );
          })}
        </div>
      </div>

      <button onClick={onClose} className="mt-6 w-full py-3.5 bg-emerald-800 text-[#F5E6D3] font-bold rounded-xl active:scale-[0.98]">
        К сегодняшнему дню
      </button>
    </Page>
  );
}
