import { useState, useEffect } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, addMonths, subMonths } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from '../../components/ClayIcon';
import Page from '../../components/Page';
import ScreenState from '../../components/ScreenState';
import { dayKey } from './utils';

const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default function MonthSheet({ today, daysWithEntries, onLoadMonth, onSelectDay, onClose }) {
  const [month, setMonth] = useState(() => startOfMonth(parseISO(today)));
  const [selectedDay, setSelectedDay] = useState(today);
  const [status, setStatus] = useState('loading');
  const [retry, setRetry] = useState(0);
  const isCurrentMonth = isSameMonth(month, parseISO(today));

  useEffect(() => {
    let cancelled = false;
    onLoadMonth(month.getFullYear(), month.getMonth() + 1)
      .then(() => { if (!cancelled) setStatus('ready'); })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [month, onLoadMonth, retry]);

  const changeMonth = (next) => { setStatus('loading'); setMonth(next); };
  const selectDay = async (date) => {
    const key = dayKey(date);
    if (!isSameMonth(date, month)) {
      setStatus('loading');
      try { await onLoadMonth(date.getFullYear(), date.getMonth() + 1); }
      catch { setStatus('error'); return; }
      setStatus('ready');
    }
    setSelectedDay(key);
    onSelectDay(key);
  };
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });

  return (
    <Page title="Календарь" onBack={onClose}>
      <div className="calendar-grid">
        <div className="flex items-center justify-between mb-4">
          <button type="button" onClick={() => changeMonth(subMonths(month, 1))} aria-label="Предыдущий месяц" className="ui-icon-button bg-rose-900"><ChevronLeft size={20} /></button>
          <h3 className="text-lg font-semibold capitalize">{format(month, 'LLLL yyyy', { locale: ru })}</h3>
          <button type="button" onClick={() => changeMonth(addMonths(month, 1))} disabled={isCurrentMonth} aria-label="Следующий месяц" className="ui-icon-button bg-rose-900 disabled:opacity-35"><ChevronRight size={20} /></button>
        </div>
        {status === 'error' ? <ScreenState error title="Не удалось загрузить записи" onRetry={() => { setStatus('loading'); setRetry(t => t + 1); }} /> : (
          <div className="ui-card p-3!" aria-busy={status === 'loading'}>
            <div className="grid grid-cols-7 text-center mb-2">{weekDays.map(day => <span key={day} className="ui-muted py-2">{day}</span>)}</div>
            <div className="grid grid-cols-7 gap-1">
              {days.map(date => {
                const key = dayKey(date);
                return (
                  <button key={key} type="button" disabled={key > today || status === 'loading'} onClick={() => selectDay(date)} aria-current={key === today ? 'date' : undefined} aria-label={`${format(date, 'd MMMM', { locale: ru })}${daysWithEntries.has(key) ? ', есть записи' : ''}`} className={`calendar-day ${key === selectedDay ? 'is-selected' : ''} ${!isSameMonth(date, month) ? 'opacity-60' : ''}`}>
                    {format(date, 'd')}
                    <span className="calendar-dot" style={{ visibility: daysWithEntries.has(key) ? 'visible' : 'hidden' }} />
                  </button>
                );
              })}
            </div>
            {status === 'loading' && <p className="ui-muted text-center mt-3" role="status">Загружаем записи…</p>}
          </div>
        )}
        <button type="button" onClick={onClose} className="ui-button ui-button--outline mt-6">К сегодняшнему дню</button>
      </div>
    </Page>
  );
}
