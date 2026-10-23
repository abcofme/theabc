import { useState, useEffect, useMemo } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { CalendarDays, Flame, Plus, MessageCircle, ChevronRight } from 'lucide-react';
import { useProfile } from '../../context/profile';
import useDiary from './useDiary';
import WeekStrip from './WeekStrip';
import EntryList, { AnalysisHint } from './EntryList';
import EntryForm from './EntryForm';
import MonthSheet from './MonthSheet';
import DaySheet from './DaySheet';
import { dayKey, plural, analysisLock } from './utils';

const byId = (a, b) => a.id - b.id;

// Дневник открывается на сегодняшнем дне: что произошло сегодня, ответ дневника и неделя вокруг.
// Месяц и прошлые дни — во всплывающих экранах
export default function DiaryTab() {
  const { profile } = useProfile();
  const [today, setToday] = useState(() => dayKey(new Date()));
  const [reloadTick, setReloadTick] = useState(0);
  const diary = useDiary(today);
  const { entries, streak, overviewStatus, loadOverview, loadMonth } = diary;

  const [openDay, setOpenDay] = useState(null);
  const [isMonthOpen, setIsMonthOpen] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);

  const lock = analysisLock(profile);

  // Вернулись в приложение — мог смениться день, а записи — добавиться с другого устройства
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setToday(dayKey(new Date()));
      setReloadTick(t => t + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview, reloadTick]);

  const entriesByDay = useMemo(() => {
    const map = new Map();
    entries.forEach(e => map.set(e.date, [...(map.get(e.date) || []), e]));
    map.forEach(list => list.sort(byId));
    return map;
  }, [entries]);
  const daysWithEntries = useMemo(() => new Set(entriesByDay.keys()), [entriesByDay]);

  const todayEntries = entriesByDay.get(today) || [];
  const recentDays = Array.from({ length: 6 }, (_, i) => dayKey(subDays(parseISO(today), i + 1)))
    .filter(key => entriesByDay.has(key))
    .slice(0, 3);

  const selectDay = (key) => {
    if (key === today) {
      setOpenDay(null);
      setIsMonthOpen(false);
    } else {
      setOpenDay(key);
    }
  };

  // Подсказка ведёт на другую вкладку — закрываем открытые поверх дневника экраны
  const closeSheets = () => {
    setOpenDay(null);
    setIsMonthOpen(false);
  };

  const addToday = async (event, reaction) => {
    await diary.addEntry(today, event, reaction);
    setIsComposerOpen(false);
  };

  return (
    <div className="flex flex-col flex-1 w-full max-w-2xl mx-auto">
      {/* ШАПКА: СЕГОДНЯШНИЙ ДЕНЬ И СЕРИЯ */}
      <div className="flex items-start justify-between gap-3 mt-2 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-3xl font-bold text-[#F5E6D3]">Сегодня</h2>
            {streak >= 2 && (
              <span className="flex items-center gap-1 bg-emerald-800 text-[#F5E6D3] text-xs font-bold px-2 py-1 rounded-lg">
                <Flame size={14} /> {streak} {plural(streak, ['день', 'дня', 'дней'])} подряд
              </span>
            )}
          </div>
          <p className="text-sm text-[#F5E6D3]/70 mt-0.5">{format(parseISO(today), 'EEEE, d MMMM', { locale: ru })}</p>
        </div>
        <button
          onClick={() => setIsMonthOpen(true)}
          aria-label="Открыть календарь"
          className="p-2.5 bg-rose-900/80 rounded-xl text-[#F5E6D3] shrink-0 active:scale-95"
        >
          <CalendarDays size={22} />
        </button>
      </div>

      <WeekStrip today={today} daysWithEntries={daysWithEntries} onSelect={selectDay} />

      {/* КАРТОЧКА СЕГОДНЯШНЕГО ДНЯ */}
      <section className="bg-rose-900/80 rounded-3xl p-4 backdrop-blur-sm">
        {overviewStatus === 'loading' ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#F5E6D3] border-t-transparent" />
          </div>
        ) : overviewStatus === 'error' ? (
          <div className="text-center py-6">
            <p className="text-[#F5E6D3] mb-3">Не удалось загрузить дневник</p>
            <button onClick={() => setReloadTick(t => t + 1)} className="px-5 py-2.5 bg-rose-800 text-[#F5E6D3] font-bold rounded-xl">
              Повторить
            </button>
          </div>
        ) : todayEntries.length > 0 ? (
          <>
            <EntryList entries={todayEntries} diary={diary} lock={lock} />
            {isComposerOpen ? (
              <div className="mt-4">
                <EntryForm title="Что ещё произошло?" onSubmit={addToday} onCancel={() => setIsComposerOpen(false)} />
              </div>
            ) : (
              <button
                onClick={() => setIsComposerOpen(true)}
                className="mt-3 w-full py-3 border border-[#F5E6D3]/40 text-[#F5E6D3] font-bold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <Plus size={18} /> Ещё событие
              </button>
            )}
          </>
        ) : (
          <EntryForm title="Что сегодня произошло?" onSubmit={addToday} />
        )}
        {overviewStatus === 'ready' && <AnalysisHint lock={lock} />}
      </section>

      {/* НЕДАВНИЕ ДНИ ИЛИ ПОДСКАЗКА ДЛЯ НОВИЧКА */}
      {recentDays.length > 0 ? (
        <section className="mt-6">
          <h3 className="text-xs font-bold text-[#F5E6D3]/70 uppercase tracking-wider mb-2 px-1">Недавние</h3>
          <div className="flex flex-col gap-2">
            {recentDays.map(key => {
              const dayEntries = entriesByDay.get(key);
              const hasReply = dayEntries.some(e => e.portrait_match_explanation);
              return (
                <button
                  key={key}
                  onClick={() => setOpenDay(key)}
                  className="w-full flex items-center gap-3 bg-rose-900/60 rounded-2xl px-4 py-3 text-left text-[#F5E6D3] active:scale-[0.98]"
                >
                  <span className="text-xs text-[#F5E6D3]/70 shrink-0 whitespace-nowrap first-letter:uppercase">
                    {format(parseISO(key), 'EEEEEE, d MMM', { locale: ru })}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{dayEntries[0].event}</span>
                  {dayEntries.length > 1 && <span className="text-xs text-[#F5E6D3]/70 shrink-0">+{dayEntries.length - 1}</span>}
                  {hasReply && <MessageCircle size={16} className="shrink-0 text-emerald-500" aria-label="Есть ответ дневника" />}
                  <ChevronRight size={16} className="shrink-0 text-[#F5E6D3]/60" />
                </button>
              );
            })}
          </div>
        </section>
      ) : overviewStatus === 'ready' && todayEntries.length === 0 && (
        <p className="mt-6 px-2 text-sm text-[#F5E6D3]/80 text-center leading-relaxed">
          Записывай, что произошло и как ты отреагировал(а). Дневник знает твои сильные и слабые стороны,
          сверит реакцию с портретом личности и ответит — без искажений.
        </p>
      )}

      {isMonthOpen && (
        <MonthSheet
          today={today}
          daysWithEntries={daysWithEntries}
          onLoadMonth={loadMonth}
          onSelectDay={selectDay}
          onClose={() => setIsMonthOpen(false)}
        />
      )}

      {openDay && (
        <DaySheet
          day={openDay}
          entries={entriesByDay.get(openDay) || []}
          diary={diary}
          lock={lock}
          onNavigate={closeSheets}
          onClose={() => setOpenDay(null)}
        />
      )}
    </div>
  );
}
