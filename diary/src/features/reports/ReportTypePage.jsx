import { useState, useEffect, useRef, useId } from 'react';
import { AlertTriangle, ChevronRight, FileText, Lock } from 'lucide-react';
import Page from '../../components/Page';
import ClayBanner from '../../components/ClayBanner';
import ClayText from '../../components/ClayText';
import GenerationProgress from '../../components/GenerationProgress';
import { PERIODS, formatDay, periodLabel } from './reportTypes';
import { FEW_ENTRIES, entriesLevel, groupLock, reportExcerpt } from './reportHelpers';
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
  const level = entriesLevel(count);

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

  if (isGenerating) return <section className="ui-card"><GenerationProgress text="Отчет формируется…" /><p className="ui-secondary text-center">Можно вернуться к другим делам. Когда отчет будет готов, он появится здесь, а бот пришлет сообщение.</p></section>;
  return (
    <section className="ui-card flex flex-col gap-4" aria-labelledby={`${periodId}-title`}>
      <h3 id={`${periodId}-title`} className="text-lg leading-6 font-semibold"><ClayText text="Новый отчет" /></h3>
      <div>
        <p id={periodId} className="ui-secondary mb-2">Период</p>
        <div className="ui-chips" role="radiogroup" aria-labelledby={periodId}>
          {PERIODS.map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={period === id} onClick={() => setPeriod(id)}>{label}</button>
          ))}
        </div>
      </div>
      {period === 'custom' && <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
        <label className="ui-secondary">С<input type="date" value={customStart} onInput={e => setCustomStart(e.currentTarget.value)} onChange={e => setCustomStart(e.target.value)} className="ui-input mt-2" /></label>
        <label className="ui-secondary">По (необязательно)<input type="date" value={customEnd} min={customStart || undefined} onInput={e => setCustomEnd(e.currentTarget.value)} onChange={e => setCustomEnd(e.target.value)} className="ui-input mt-2" /></label>
      </div>}
      {invalidRange ? <p className="ui-secondary" role="alert">Дата окончания должна быть не раньше начала.</p> : !incomplete && (
        countError === countKey ? <p className="ui-secondary" role="alert">Не удалось посчитать записи. <button type="button" onClick={() => setRetry(t => t + 1)} className="underline underline-offset-4 py-2">Повторить</button></p> : (
          <div aria-live="polite">
            <p className="ui-secondary">{count === null ? 'Считаем записи…' : count === 0 ? 'За этот период записей нет' : `В отчет войдут ${count} ${plural(count, ['запись', 'записи', 'записей'])} дневника`}</p>
            <div className="entries-meter mt-2" aria-hidden="true">{[1, 2, 3, 4].map(step => <span key={step} data-on={level >= step || undefined} />)}</div>
            <p className="ui-muted mt-2">Чем больше записей, тем точнее отчет</p>
          </div>
        )
      )}
      {count !== null && count > 0 && count < FEW_ENTRIES && <p className="ui-secondary flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5 text-orange-400" />Записей мало — отчет может получиться неточным.</p>}
      <button type="button" onClick={generate} disabled={!!incomplete || !!invalidRange || count === null || count === 0 || countError === countKey} className="ui-button ui-button--primary">
        {canAfford ? 'Сформировать отчет' : 'Пополнить баланс'}
      </button>
      {!canAfford ? <p className="ui-secondary text-center">Баланса не хватает на отчет. Пополни его или подключи Premium.</p>
        : !isPremium && <p className="ui-muted text-center">Оплачивается с баланса</p>}
    </section>
  );
}

// Вид отчета: та же обложка, вопрос, на который он отвечает, последний отчет, новый и история
export default function ReportTypePage({ type, reports, onOpenReport, onCreated, onBack, isGenerating, onGeneratingChange }) {
  const { profile } = useProfile();
  const { navigate } = useAppNav();
  const lock = groupLock(type.group, profile);
  const [latest, ...earlier] = reports;
  const excerpt = latest ? reportExcerpt(latest.content) : '';
  const goToLock = () => { onBack(); navigate(lock.target); };

  return (
    <Page title={type.shortTitle} onBack={onBack} clayTitle>
      <div className="ui-stack">
        <div>
          <ClayBanner id={`report-hero-${type.id}`} kind="report" title={type.shortTitle} description={type.subtitle} image={type.image} />
          <p className="report-question">{type.question}</p>
        </div>

        {latest && (
          <button type="button" onClick={() => onOpenReport(latest)} className="ui-card report-preview">
            <span className="flex items-center justify-between gap-3">
              <span className="report-strip__label">Последний отчет · {formatDay(latest.created_at)}</span>
              {latest.is_read === false && <span className="ui-badge">Новый</span>}
            </span>
            {excerpt && <span className="report-preview__text">{excerpt}</span>}
            <span className="flex items-center justify-between gap-3 mt-3">
              <span className="ui-muted">{periodLabel(latest)}</span>
              <span className="flex items-center gap-1 font-semibold text-sm">Читать <ChevronRight size={18} /></span>
            </span>
          </button>
        )}

        {lock ? (
          <section className="ui-card flex gap-3">
            <Lock size={18} className="shrink-0 mt-1 text-[#F5E6D3]/75" />
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold mb-1"><ClayText text={lock.label} /></h3>
              <p className="ui-secondary mb-4">{lock.text}</p>
              <button type="button" onClick={goToLock} className="ui-button ui-button--primary">{lock.action}</button>
            </div>
          </section>
        ) : (
          <NewReportForm type={type} onCreated={onCreated} isGenerating={isGenerating} onGeneratingChange={onGeneratingChange} />
        )}

        {earlier.length > 0 && <section>
          <h3 className="text-lg font-semibold mb-2"><ClayText text="История" /></h3>
          {earlier.map(report => (
            <button key={report.id} type="button" onClick={() => onOpenReport(report)} className="ui-row">
              <FileText size={20} className="shrink-0 text-[#F5E6D3]/75" />
              <span className="flex-1 min-w-0"><span className="flex flex-wrap gap-2 items-center font-medium">Отчет от {formatDay(report.created_at)}{report.is_read === false && <span className="ui-badge">Новый</span>}</span><span className="ui-muted block mt-1">{periodLabel(report)}</span></span>
              <ChevronRight size={20} className="shrink-0" />
            </button>
          ))}
        </section>}
      </div>
    </Page>
  );
}
