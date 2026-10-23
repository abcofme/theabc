import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, FileText, Trash2 } from 'lucide-react';
import ClayBanner from '../../components/ClayBanner';
import Page from '../../components/Page';
import GenerationProgress from '../../components/GenerationProgress';
import { PERIODS, FEW_ENTRIES, formatDay, periodLabel } from './reportTypes';
import { plural } from '../diary/utils';
import { useProfile } from '../../context/profile';
import { useAppNav, useErrorHandler } from '../../navigation/appNav';
import { api, apiStream } from '../../utils/api';

const WebApp = window.Telegram.WebApp;

const fieldClass = 'w-full bg-rose-950 text-[#F5E6D3] text-base rounded-xl p-3 focus:outline-none';

// Новый отчет: период и сколько записей в него попадет — от этого зависит точность
function NewReportForm({ type, onCreated }) {
  const handleError = useErrorHandler();
  const { profile, isPremium, refreshProfile } = useProfile();
  const { openBilling } = useAppNav();
  const [period, setPeriod] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [counted, setCounted] = useState({ key: null, count: null });

  const isCustomIncomplete = period === 'custom' && !customStart;
  const countKey = `${period}|${customStart}|${customEnd}`;
  const count = counted.key === countKey ? counted.count : null;
  const canAfford = isPremium || (profile && profile.balance >= profile.prices.report);

  useEffect(() => {
    if (isCustomIncomplete) return;
    const params = new URLSearchParams({ period });
    if (period === 'custom') {
      params.set('start_date', customStart);
      if (customEnd) params.set('end_date', customEnd);
    }
    let cancelled = false;
    api(`/api/reports/entries-count?${params}`)
      .then(data => { if (!cancelled) setCounted({ key: countKey, count: data.count }); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [period, customStart, customEnd, countKey, isCustomIncomplete]);

  const generate = async () => {
    setIsGenerating(true);
    try {
      const report = await apiStream('/api/reports/generate', {
        report_type: type.id,
        period,
        start_date: period === 'custom' ? customStart : null,
        end_date: period === 'custom' && customEnd ? customEnd : null,
      });
      // Пользователь видит отчет сразу — он прочитан, и бот не напомнит о нем
      api(`/api/reports/${report.id}/read`, { method: 'POST' }).catch(console.error);
      refreshProfile();
      WebApp.HapticFeedback?.notificationOccurred('success');
      setIsGenerating(false);
      onCreated({ ...report, is_read: true });
    } catch (err) {
      setIsGenerating(false);
      handleError(err);
    }
  };

  if (isGenerating) {
    return (
      <section className="bg-rose-900/80 rounded-3xl px-5 py-2">
        <GenerationProgress text="Отчет формируется..." />
      </section>
    );
  }

  return (
    <section className="bg-rose-900/80 rounded-3xl p-5 flex flex-col gap-3">
      <h3 className="font-bold text-[#F5E6D3]">Новый отчет</h3>
      <div className="relative">
        <label htmlFor="report-period" className="sr-only">Период</label>
        <select id="report-period" value={period} onChange={(e) => setPeriod(e.target.value)} className={`${fieldClass} appearance-none p-4 pr-10`}>
          {PERIODS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-[#F5E6D3] pointer-events-none" size={20} />
      </div>

      {period === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-[#F5E6D3]/70">
            С
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className={`${fieldClass} mt-1`} />
          </label>
          <label className="text-xs text-[#F5E6D3]/70">
            По (необязательно)
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className={`${fieldClass} mt-1`} />
          </label>
        </div>
      )}

      {!isCustomIncomplete && (
        <p className="text-sm text-[#F5E6D3]/80" aria-live="polite">
          {count === null ? 'Считаю записи…' : `В отчет попадут ${count} ${plural(count, ['запись', 'записи', 'записей'])} дневника`}
        </p>
      )}
      {count !== null && count > 0 && count < FEW_ENTRIES && (
        <p className="flex gap-2 text-xs text-[#F5E6D3]/70 leading-relaxed">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-orange-400" />
          Записей мало — отчет получится неточным. Чем чаще ведешь дневник, тем точнее отчеты.
        </p>
      )}

      <button
        onClick={generate}
        disabled={isCustomIncomplete || count === 0}
        className="w-full bg-emerald-800 disabled:bg-emerald-950/50 disabled:text-[#F5E6D3]/50 text-[#F5E6D3] font-bold py-3.5 rounded-2xl active:scale-[0.98]"
      >
        {count === 0 ? 'За этот период записей нет' : 'Сформировать отчет'}
      </button>
      {!canAfford && (
        <button onClick={openBilling} className="text-xs text-[#F5E6D3]/70 underline underline-offset-2">
          Баланс расходуется по мере использования и сейчас закончился — пополнить или оформить Premium
        </button>
      )}
    </section>
  );
}

// Страница вида отчета: о чем он, новый отчет и история
export default function ReportTypePage({ type, reports, onOpenReport, onDelete, onCreated, onBack }) {
  const { profile } = useProfile();
  const { navigate } = useAppNav();
  const careerTestsPassed = profile?.categories?.find(c => c.name === 'Профориентация')?.tests.some(t => t.passed);
  const needsCareerTests = type.group === 'career' && !careerTestsPassed;

  const toTests = () => {
    onBack();
    navigate({ tab: 'tests' });
  };

  return (
    <Page title={type.shortTitle} onBack={onBack}>
      <div className="flex flex-col gap-4">
        <ClayBanner id={`report-page-${type.id}`} kind="report" title={type.bannerTitle || type.shortTitle} description={type.subtitle} image={type.image} />
        <div className="px-1">
          <p className="text-lg font-bold text-[#F5E6D3] leading-snug">{type.title}</p>
          <p className="text-sm text-[#F5E6D3]/70 mt-1">{type.subtitle}</p>
        </div>

        {needsCareerTests ? (
          <section className="bg-rose-900/80 rounded-3xl p-5">
            <p className="text-sm text-[#F5E6D3]/80 mb-4">Этот отчет строится по тестам профориентации — сначала пройди их.</p>
            <button onClick={toTests} className="w-full py-3.5 bg-emerald-800 text-[#F5E6D3] font-bold rounded-2xl">К тестам</button>
          </section>
        ) : (
          <NewReportForm type={type} onCreated={onCreated} />
        )}

        {reports.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-bold text-[#F5E6D3]/70 uppercase tracking-wider px-1 mt-2">История</h3>
            <div className="bg-rose-900/60 rounded-3xl divide-y divide-[#F5E6D3]/10 overflow-hidden">
              {reports.map(report => (
                <div key={report.id} className="flex items-stretch">
                  <button onClick={() => onOpenReport(report)} className="flex-1 min-w-0 flex items-center gap-3 pl-4 py-3.5 text-left">
                    <FileText size={20} className="shrink-0 text-[#F5E6D3]/80" />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2 text-[#F5E6D3] font-medium">
                        Отчет от {formatDay(report.created_at)}
                        {report.is_read === false && (
                          <span className="text-[10px] font-bold text-rose-950 bg-[#e5c398] px-2 py-0.5 rounded-full">Новый</span>
                        )}
                      </span>
                      <span className="block text-xs text-[#F5E6D3]/60 mt-0.5">{periodLabel(report)}</span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-[#F5E6D3]/60" />
                  </button>
                  <button onClick={() => onDelete(report)} aria-label="Удалить отчет" className="px-4 text-[#F5E6D3]/50 hover:text-[#F5E6D3]">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Page>
  );
}
