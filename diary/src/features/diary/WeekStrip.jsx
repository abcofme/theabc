import { format, parseISO, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { dayKey } from './utils';

// Последние 7 дней, сегодня справа. Точка — в этот день есть записи
export default function WeekStrip({ today, daysWithEntries, onSelect }) {
  const todayDate = parseISO(today);
  const days = Array.from({ length: 7 }, (_, i) => subDays(todayDate, 6 - i));

  return (
    <div className="grid grid-cols-7 gap-1.5 mb-4">
      {days.map(date => {
        const key = dayKey(date);
        const isToday = key === today;
        const hasEntries = daysWithEntries.has(key);
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`flex flex-col items-center py-2 rounded-2xl active:scale-95 ${
              isToday ? 'bg-[#F5E6D3] text-rose-950' : 'bg-rose-900/60 text-[#F5E6D3]'
            }`}
          >
            <span className={`text-[11px] ${isToday ? 'font-bold' : 'opacity-70'}`}>{format(date, 'EEEEEE', { locale: ru })}</span>
            <span className="text-base font-bold leading-tight">{format(date, 'd')}</span>
            <span className={`w-1.5 h-1.5 mt-1 rounded-full ${
              hasEntries ? (isToday ? 'bg-emerald-800' : 'bg-emerald-500') : 'bg-transparent'
            }`} />
          </button>
        );
      })}
    </div>
  );
}
