import { useState, useEffect, useMemo } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { CalendarDays, Flame, Plus, MessageCircle, ChevronRight } from '../../components/ClayIcon';
import { useProfile } from '../../context/profile';
import useDiary from './useDiary';
import WeekStrip from './WeekStrip';
import EntryList, { AnalysisHint } from './EntryList';
import EntryForm from './EntryForm';
import MonthSheet from './MonthSheet';
import DaySheet from './DaySheet';
import ScreenState from '../../components/ScreenState';
import ClayText from '../../components/ClayText';
import PortraitPath from './PortraitPath';
import { dayKey, plural, analysisLock, newestEntryFirst } from './utils';

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
  const [savedEntryId, setSavedEntryId] = useState(null);

  const lock = analysisLock(profile);
  // Без портрета путь к ответам показывает отдельная карточка, строка-подсказка нужна только про баланс
  const showPath = !!profile && !profile.portrait;

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
    map.forEach(list => list.sort(newestEntryFirst));
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
    const id = await diary.addEntry(today, event, reaction);
    setSavedEntryId(id);
    setIsComposerOpen(false);
  };

  return (
    <div className="app-screen flex flex-col flex-1">
      {/* ШАПКА: СЕГОДНЯШНИЙ ДЕНЬ И СЕРИЯ */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="screen-title"><ClayText text="Сегодня" /></h1>
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
          className="ui-icon-button bg-rose-900 shrink-0"
        >
          <CalendarDays size={24} />
        </button>
      </div>

      <WeekStrip today={today} daysWithEntries={daysWithEntries} onSelect={selectDay} />

      {showPath && <div className="mb-4"><PortraitPath onNavigate={closeSheets} /></div>}

      {overviewStatus === 'loading' ? (
        <ScreenState loading title="Загружаем записи…" />
      ) : overviewStatus === 'error' ? (
        <ScreenState error title="Не удалось загрузить дневник" onRetry={() => setReloadTick(t => t + 1)} />
      ) : (
        <div className="flex flex-col gap-4">
          {todayEntries.length > 0 && !isComposerOpen && (
            <button type="button" onClick={() => setIsComposerOpen(true)} className="ui-button ui-button--primary">
              <Plus size={20} /> Записать событие
            </button>
          )}
          {(todayEntries.length === 0 || isComposerOpen) && (
            <div className="ui-card">
              <EntryForm
                key={today}
                draftKey={`new:${today}`}
                title={todayEntries.length > 0 ? 'Что ещё произошло?' : 'Что сегодня произошло?'}
                onSubmit={addToday}
                onCancel={todayEntries.length > 0 ? () => setIsComposerOpen(false) : undefined}
              />
            </div>
          )}
          <EntryList entries={todayEntries} diary={diary} lock={lock} savedEntryId={savedEntryId} />
          <AnalysisHint lock={showPath ? null : lock} />
        </div>
      )}

      {/* НЕДАВНИЕ ДНИ ИЛИ ПОДСКАЗКА ДЛЯ НОВИЧКА */}
      {recentDays.length > 0 ? (
        <section className="mt-6">
          <h3 className="ui-section-label mb-3">Недавние</h3>
          <div className="flex flex-col gap-2">
            {recentDays.map(key => {
              const dayEntries = entriesByDay.get(key);
              const hasReply = dayEntries.some(e => e.portrait_match_explanation);
              return (
                <button
                  key={key}
                  onClick={() => setOpenDay(key)}
                  className="w-full flex items-center gap-3 bg-rose-900 rounded-2xl px-4 py-3 text-left text-[#F5E6D3] active:scale-[0.98]"
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
      ) : overviewStatus === 'ready' && todayEntries.length === 0 && !showPath && (
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
          key={openDay}
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
