import { useState } from 'react';
import Page from '../../components/Page';
import ReferralAnalytics from './ReferralAnalytics';
import ReferralFinance from './ReferralFinance';
import ReferralLinks from './ReferralLinks';

const PERIODS = [['week', 'Неделя'], ['month', '30 дней'], ['custom', 'Свой период'], ['all', 'Всё время']];
const TABS = [['analytics', 'Аналитика'], ['links', 'Ссылки'], ['finance', 'Выплаты']];

export function ReferralCabinet({ admin = false }) {
  const [view, setView] = useState('analytics');
  const [period, setPeriod] = useState('week');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const custom = period === 'custom';
  const wrongOrder = custom && start && end && start > end;
  const missing = custom && !start && !end;
  const params = new URLSearchParams({ period });
  if (custom && start) params.set('start_date', start);
  if (custom && end) params.set('end_date', end);
  const query = wrongOrder || missing ? null : params.toString();

  return (
    <div className="flex flex-col gap-4">
      {!admin && <div role="group" aria-label="Разделы партнёрского кабинета" className="ui-segmented">
        {TABS.map(([value, label]) => (
          <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>
        ))}
      </div>}
      {view !== 'links' && <>
        <div role="group" aria-label="Период аналитики" className="ui-segmented admin-periods">
          {PERIODS.map(([value, label]) => (
            <button type="button" key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>
          ))}
        </div>
        {custom && <div className="ui-card grid grid-cols-2 gap-2">
          <label className="min-w-0 ui-secondary text-sm">
            Начало периода
            <input className="ui-input mt-1" type="date" value={start} onChange={event => setStart(event.target.value)} />
          </label>
          <label className="min-w-0 ui-secondary text-sm">
            Конец периода
            <input className="ui-input mt-1" type="date" value={end} onChange={event => setEnd(event.target.value)} />
          </label>
          {missing && <p className="col-span-2 ui-muted">Укажите хотя бы одну дату. Период считается по Москве.</p>}
          {wrongOrder && <p role="alert" className="col-span-2 ui-secondary">Конец периода должен быть не раньше начала.</p>}
        </div>}
      </>}
      {view === 'analytics' && <ReferralAnalytics admin={admin} query={query} />}
      {view === 'links' && <ReferralLinks />}
      {view === 'finance' && <ReferralFinance query={query} />}
    </div>
  );
}

export default function ReferralPage({ onBack }) {
  return <Page title="Партнёрская программа" onBack={onBack}>
    <div className="admin-content"><ReferralCabinet /></div>
  </Page>;
}
