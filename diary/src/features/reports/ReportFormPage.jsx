import { useEffect, useState } from 'react';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import Page from '../../components/Page';
import GenerationProgress from '../../components/GenerationProgress';
import ReportBanner from './ReportBanner';
import { PERIODS, FEW_ENTRIES } from './reportTypes';
import { plural } from '../diary/utils';
import { useErrorHandler } from '../../navigation/appNav';
import { useProfile } from '../../context/profile';
import { api, apiStream } from '../../utils/api';

const WebApp = window.Telegram.WebApp;

const fieldClass = 'w-full bg-rose-950 text-[#F5E6D3] text-base rounded-xl p-3 focus:outline-none';

// Новый отчет: период и сколько записей в него попадет — от этого зависит точность
export default function ReportFormPage({ type, onBack, onCreated }) {
  const handleError = useErrorHandler();
  const { refreshProfile } = useProfile();
  const [period, setPeriod] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [counted, setCounted] = useState({ key: null, count: null });

  const isCustomIncomplete = period === 'custom' && !customStart;
  const countKey = `${period}|${customStart}|${customEnd}`;
  const count = counted.key === countKey ? counted.count : null;

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
      onCreated({ ...report, is_read: true });
    } catch (err) {
      setIsGenerating(false);
      handleError(err);
    }
  };

  return (
    <Page title={type.shortTitle} onBack={onBack}>
      <div className="mb-6">
        <ReportBanner report={type} />
        <p className="text-sm text-[#F5E6D3]/80 leading-relaxed mt-4 px-1">{type.title}</p>
      </div>

      {isGenerating ? (
        <GenerationProgress text="Отчет формируется..." />
      ) : (
        <>
          <div className="bg-rose-900 rounded-2xl p-5 mb-4">
            <label htmlFor="report-period" className="text-sm font-bold text-[#F5E6D3] uppercase tracking-wider mb-4 block">Период</label>
            <div className="relative mb-4">
              <select id="report-period" value={period} onChange={(e) => setPeriod(e.target.value)} className={`${fieldClass} appearance-none p-4 pr-10`}>
                {PERIODS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-[#F5E6D3] pointer-events-none" size={20} />
            </div>

            {period === 'custom' && (
              <div className="flex flex-col gap-3">
                <div>
                  <label htmlFor="report-start" className="text-xs text-[#F5E6D3] uppercase tracking-wider mb-1 block">С</label>
                  <input id="report-start" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className={fieldClass} />
                </div>
                <div>
                  <label htmlFor="report-end" className="text-xs text-[#F5E6D3] uppercase tracking-wider mb-1 block">По (необязательно)</label>
                  <input id="report-end" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className={fieldClass} />
                </div>
              </div>
            )}

            {!isCustomIncomplete && (
              <p className="text-sm text-[#F5E6D3]/80" aria-live="polite">
                {count === null ? 'Считаю записи…' : `В отчет попадут ${count} ${plural(count, ['запись', 'записи', 'записей'])} дневника`}
              </p>
            )}
            {count !== null && count > 0 && count < FEW_ENTRIES && (
              <p className="mt-3 flex gap-2 text-xs text-[#F5E6D3]/70 leading-relaxed">
                <AlertTriangle size={14} className="shrink-0 mt-0.5 text-orange-400" />
                Записей мало — отчет получится неточным. Чем чаще ведешь дневник, тем точнее отчеты.
              </p>
            )}
          </div>

          <button
            onClick={generate}
            disabled={isCustomIncomplete || count === 0}
            className="w-full bg-emerald-800 disabled:bg-emerald-950/50 disabled:text-[#F5E6D3]/50 text-[#F5E6D3] font-bold py-4 rounded-2xl active:scale-[0.98]"
          >
            {count === 0 ? 'За этот период записей нет' : 'Проанализировать'}
          </button>
        </>
      )}
    </Page>
  );
}
