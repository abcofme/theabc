import { format, parseISO, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { dayKey } from './utils';

export default function WeekStrip({ today, daysWithEntries, onSelect }) {
  const days = Array.from({ length: 7 }, (_, i) => subDays(parseISO(today), 6 - i));
  return (
    <div className="calendar-week grid grid-cols-7 gap-1.5 mb-5" aria-label="Последние семь дней">
      {days.map(date => {
        const key = dayKey(date);
        const isToday = key === today;
        return (
          <button key={key} type="button" onClick={() => onSelect(key)} className={`calendar-day ${isToday ? 'is-selected' : ''}`} aria-current={isToday ? 'date' : undefined} aria-label={`${format(date, 'd MMMM, EEEE', { locale: ru })}${daysWithEntries.has(key) ? ', есть записи' : ''}`}>
            <span className="text-[11px] leading-4 opacity-75">{format(date, 'EEEEEE', { locale: ru })}</span>
            <span className="text-base leading-5 font-semibold">{format(date, 'd')}</span>
            <span className="calendar-dot" style={{ visibility: daysWithEntries.has(key) ? 'visible' : 'hidden' }} />
          </button>
        );
      })}
    </div>
  );
}
