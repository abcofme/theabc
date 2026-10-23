import { useState, useEffect, useRef, useId } from 'react';
import { AlertTriangle, ChevronRight, FileText, Trash2 } from 'lucide-react';
import Page from '../../components/Page';
import GenerationProgress from '../../components/GenerationProgress';
import { PERIODS, FEW_ENTRIES, formatDay, periodLabel } from './reportTypes';
import { plural } from '../diary/utils';
import { useProfile } from '../../context/profile';
import { useAppNav, useErrorHandler } from '../../navigation/appNav';
import { api, apiStream } from '../../utils/api';

const WebApp = window.Telegram.WebApp;

function NewReportForm({ type, onCreated, isGenerating, onGeneratingChange }) {
  const handleError = useErrorHandler();
  const { profile, isPremium, refreshProfile } = useProfile();
  const { openBilling } = useAppNav();
  const [period, setPeriod] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [counted, setCounted] = useState({ key: null, count: null });
  const [countError, setCountError] = useState(null);
  const [retry, setRetry] = useState(0);
  const submitting = useRef(false);
  const periodId = useId();
  const incomplete = period === 'custom' && !customStart;
  const invalidRange = period === 'custom' && customStart && customEnd && customStart > customEnd;
  const countKey = `${period}|${customStart}|${customEnd}`;
  const count = counted.key === countKey ? counted.count : null;
  const canAfford = isPremium || profile.balance >= profile.prices.report;

  useEffect(() => {
    if (incomplete || invalidRange) return;
    const params = new URLSearchParams({ period });
    if (period === 'custom') {
      params.set('start_date', customStart);
      if (customEnd) params.set('end_date', customEnd);
    }
    let cancelled = false;
    api(`/api/reports/entries-count?${params}`)
      .then(data => { if (!cancelled) { setCounted({ key: countKey, count: data.count }); setCountError(null); } })
      .catch(() => { if (!cancelled) setCountError(countKey); });
    return () => { cancelled = true; };
  }, [period, customStart, customEnd, countKey, incomplete, invalidRange, retry]);

  const generate = async () => {
    if (submitting.current || isGenerating || count === null || count === 0 || incomplete || invalidRange) return;
    if (!canAfford) { openBilling(); return; }
    submitting.current = true;
    onGeneratingChange(true);
    try {
      const report = await apiStream('/api/reports/generate', {
        report_type: type.id, period,
        start_date: period === 'custom' ? customStart : null,
        end_date: period === 'custom' && customEnd ? customEnd : null,
      });
      refreshProfile();
      WebApp.HapticFeedback?.notificationOccurred('success');
      // Родитель решает, открывать ли результат: пользователь мог уйти на другую вкладку.
      onCreated(report);
    } catch (err) {
      refreshProfile();
      handleError(err);
    } finally {
      submitting.current = false;
      onGeneratingChange(false);
    }
  };

  if (isGenerating) return <section className="ui-card"><GenerationProgress text="Отчет формируется…" /><p className="ui-secondary">Можно вернуться к другим делам. Готовый отчет появится в истории.</p></section>;
  return (
    <section className="ui-card flex flex-col gap-4">
      <h3 className="text-lg font-semibold">Новый отчет</h3>
      <div>
        <label htmlFor={periodId} className="ui-secondary">Период</label>
        <select id={periodId} value={period} onChange={e => setPeriod(e.target.value)} className="ui-input mt-2">
          {PERIODS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>
      {period === 'custom' && <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
        <label className="ui-secondary">С<input type="date" value={customStart} onInput={e => setCustomStart(e.currentTarget.value)} onChange={e => setCustomStart(e.target.value)} className="ui-input mt-2" /></label>
        <label className="ui-secondary">По (необязательно)<input type="date" value={customEnd} min={customStart || undefined} onInput={e => setCustomEnd(e.currentTarget.value)} onChange={e => setCustomEnd(e.target.value)} className="ui-input mt-2" /></label>
      </div>}
      {invalidRange ? <p className="ui-secondary" role="alert">Дата окончания должна быть не раньше начала.</p> : !incomplete && (
        countError === countKey ? <p className="ui-secondary" role="alert">Не удалось посчитать записи. <button type="button" onClick={() => setRetry(t => t + 1)} className="underline underline-offset-4 py-2">Повторить</button></p> : <p className="ui-secondary" aria-live="polite">{count === null ? 'Считаем записи…' : `В отчет попадут ${count} ${plural(count, ['запись', 'записи', 'записей'])} дневника`}</p>
      )}
      {count !== null && count > 0 && count < FEW_ENTRIES && <p className="ui-secondary flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5 text-orange-400" />Записей мало — отчет может получиться неточным.</p>}
      <button type="button" onClick={generate} disabled={!!incomplete || !!invalidRange || count === null || count === 0 || countError === countKey} className="ui-button ui-button--primary">
        {count === 0 ? 'За этот период записей нет' : !canAfford ? 'Подписка и баланс' : isPremium ? 'Сформировать отчет' : `Сформировать · ${profile.prices.report} ₽`}
      </button>
      {!canAfford && <p className="ui-secondary">На балансе {profile.balance} ₽. Для отчета нужно {profile.prices.report} ₽ или Premium.</p>}
    </section>
  );
}

export default function ReportTypePage({ type, reports, onOpenReport, onDelete, onCreated, onBack, isGenerating, onGeneratingChange }) {
  const { profile } = useProfile();
  const { navigate } = useAppNav();
  const careerTestsPassed = profile.categories?.find(c => c.name === 'Профориентация')?.tests.some(t => t.passed);
  const needsCareerTests = type.group === 'career' && !careerTestsPassed;
  const toTests = () => { onBack(); navigate({ tab: 'tests', category: 'Профориентация' }); };
  return (
    <Page title={type.shortTitle} onBack={onBack}>
      <div className="ui-stack">
        <p className="ui-secondary">{type.subtitle}</p>
        {needsCareerTests ? <section className="ui-card">
          <p className="ui-secondary mb-4">Этот отчет строится по тестам профориентации — сначала пройди их.</p>
          <button type="button" onClick={toTests} className="ui-button ui-button--primary">К тестам профориентации</button>
        </section> : <NewReportForm type={type} onCreated={onCreated} isGenerating={isGenerating} onGeneratingChange={onGeneratingChange} />}
        {reports.length > 0 && <section>
          <h3 className="ui-section-label mb-3">История</h3>
          {reports.map(report => <div key={report.id} className="flex items-stretch border-b border-[#F5E6D3]/10">
            <button type="button" onClick={() => onOpenReport(report)} className="ui-row flex-1 min-w-0">
              <FileText size={20} className="shrink-0 text-[#F5E6D3]/75" />
              <span className="flex-1 min-w-0"><span className="flex flex-wrap gap-2 items-center font-medium">Отчет от {formatDay(report.created_at)}{report.is_read === false && <span className="ui-badge">Новый</span>}</span><span className="ui-muted block mt-1">{periodLabel(report)}</span></span>
              <ChevronRight size={20} className="shrink-0" />
            </button>
            <button type="button" onClick={() => onDelete(report)} aria-label="Удалить отчет" className="ui-icon-button shrink-0 self-center"><Trash2 size={20} /></button>
          </div>)}
        </section>}
      </div>
    </Page>
  );
}
