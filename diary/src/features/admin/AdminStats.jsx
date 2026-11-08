import { useEffect, useState } from 'react';
import { ChevronDown, LoaderCircle, RefreshCw } from '../../components/ClayIcon';
import ScreenState from '../../components/ScreenState';
import { api } from '../../utils/api';
import { AdminRow, AdminSection } from './AdminReport';

const PERIODS = [
  ['today', 'Сегодня'],
  ['week', '7 дней'],
  ['month', '30 дней'],
  ['all', 'Всё время'],
];
const MODES = [['total', 'Все события'], ['unique', 'По людям']];
const formatCount = new Intl.NumberFormat('ru-RU').format;
const formatDate = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format;

function periodLabel(start, end) {
  const day = (value) => formatDate(new Date(value));
  if (start && end && start !== end) return `${day(start)} — ${day(end)}`;
  if (start && end) return day(start);
  if (start) return `с ${day(start)}`;
  if (end) return `по ${day(end)}`;
  return 'Всё время';
}

function Breakdown({ label, count, children }) {
  return (
    <details className="admin-breakdown group">
      <summary className="admin-row">
        <span>{label}</span>
        <b className="flex items-center gap-2">
          {formatCount(count)}
          <ChevronDown size={18} aria-hidden="true" className="shrink-0 group-open:rotate-180" />
        </b>
      </summary>
      <div className="admin-breakdown__body">{children}</div>
    </details>
  );
}

function StatsReport({ stats, unique }) {
  return (
    <>
      <AdminSection title="Аудитория">
        <AdminRow
          label={stats.start_date || stats.end_date ? 'Новые пользователи' : 'Всего пользователей'}
          value={formatCount(stats.total_users)}
          hint="По дате создания аккаунта"
        />
        <AdminRow
          label="Открывали приложение"
          value={formatCount(stats.active_users)}
          hint="Каждый пользователь учитывается один раз за период"
        />
      </AdminSection>
      <AdminSection title="Дневник и отчёты">
        <AdminRow label="Записи дневника" value={formatCount(stats.diary_entries)} />
        <AdminRow label="Портреты личности" value={formatCount(stats.portraits_generated)} />
        <AdminRow label="Отчёты о совместимости" value={formatCount(stats.compat_reports_generated)} />
        <Breakdown label="Отчёты по дневнику" count={stats.reports_generated}>
          {stats.reports_by_type.map(report => (
            <AdminRow key={report.type} label={report.name} value={formatCount(report.count)} />
          ))}
        </Breakdown>
      </AdminSection>
      <AdminSection title="Тесты">
        <AdminRow
          label={unique ? 'Прошли хотя бы один тест' : 'Завершено прохождений'}
          value={formatCount(stats.tests_completed)}
          hint="По тестам из текущего каталога"
        />
        {stats.tests.length === 0 && <p className="ui-muted">В каталоге пока нет категорий.</p>}
        {stats.tests.map(category => (
          <Breakdown key={category.id} label={category.name} count={category.count}>
            {category.tests.length === 0 && <p className="ui-muted py-2">В категории пока нет тестов.</p>}
            {category.tests.map(test => (
              <AdminRow key={test.id} label={test.name} value={formatCount(test.count)} />
            ))}
          </Breakdown>
        ))}
      </AdminSection>
      <p className="ui-muted">В старых периодах доступны только сохранившиеся события и известные даты первых открытий.</p>
    </>
  );
}

export default function AdminStats({ active }) {
  const [preset, setPreset] = useState('week');
  const [custom, setCustom] = useState(false);
  const [mode, setMode] = useState('total');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const unique = mode === 'unique';
  const period = custom ? 'custom' : preset;
  const datesReversed = custom && startDate && endDate && startDate > endDate;
  const datesMissing = custom && !startDate && !endDate;
  const params = new URLSearchParams({ period, unique: String(unique) });
  if (custom && startDate) params.set('start_date', startDate);
  if (custom && endDate) params.set('end_date', endDate);
  const query = datesReversed || datesMissing ? null : params.toString();
  const requestKey = `${query}:${revision}`;
  const loading = query !== null && result?.key !== requestKey;
  const current = !loading && query !== null ? result : null;

  useEffect(() => {
    if (!active || query === null) return;
    let cancelled = false;
    api(`/api/admin/stats?${query}`)
      .then(data => { if (!cancelled) setResult({ key: requestKey, data }); })
      .catch(error => { if (!cancelled) setResult({ key: requestKey, error }); });
    return () => { cancelled = true; };
  }, [active, query, requestKey]);

  const refresh = () => setRevision(value => value + 1);

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Период статистики" className="ui-segmented admin-periods">
        {PERIODS.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={period === value}
            onClick={() => { setPreset(value); setCustom(false); }}>{label}</button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 -mt-3">
        <button type="button" aria-expanded={custom} aria-controls="admin-stats-dates"
          onClick={() => setCustom(value => !value)} className="ui-icon-button gap-2">
          Свой период <ChevronDown size={16} aria-hidden="true" className={custom ? 'rotate-180' : ''} />
        </button>
        <button type="button" onClick={refresh} disabled={loading || query === null}
          aria-label="Обновить статистику" className="ui-icon-button disabled:opacity-50">
          {loading ? <LoaderCircle size={20} className="animate-spin" /> : <RefreshCw size={20} />}
        </button>
      </div>
      <div id="admin-stats-dates" hidden={!custom}>
        {custom && (
          <div className="ui-card grid grid-cols-2 gap-3">
            <label className="min-w-0 ui-secondary text-sm">
              Начало периода
              <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="ui-input mt-1" />
            </label>
            <label className="min-w-0 ui-secondary text-sm">
              Конец периода
              <input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} className="ui-input mt-1" />
            </label>
            {datesReversed && <p role="alert" className="col-span-2 ui-secondary">Конец периода должен быть не раньше начала.</p>}
            {datesMissing && <p className="col-span-2 ui-muted">Укажите хотя бы одну дату.</p>}
          </div>
        )}
      </div>
      <div role="group" aria-label="Как считать" className="ui-segmented">
        {MODES.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>
        ))}
      </div>
      <div className="ui-muted">
        {current?.data && <p className="font-semibold">{periodLabel(current.data.start_date, current.data.end_date)} · МСК</p>}
        <p>{unique
          ? 'Каждый человек считается один раз в каждой строке. Итоги считаются отдельно.'
          : 'Повторные прохождения тестов и генерации отчётов учитываются отдельно.'}</p>
      </div>
      {loading && <ScreenState loading title="Загрузка статистики…" />}
      {current?.error && <ScreenState error title="Не удалось загрузить статистику" onRetry={refresh} />}
      {current?.data && <StatsReport stats={current.data} unique={unique} />}
    </div>
  );
}
