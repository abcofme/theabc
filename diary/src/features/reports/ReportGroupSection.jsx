import { useEffect, useState } from 'react';
import { ChevronRight, FileText, NotebookPen } from 'lucide-react';
import ClayBanner from '../../components/ClayBanner';
import Spinner from '../../components/Spinner';
import { REPORT_TYPES, reportTypeOf, formatDay, periodLabel } from './reportTypes';
import { plural } from '../diary/utils';
import { useAppNav } from '../../navigation/appNav';
import { useProfile } from '../../context/profile';
import { api } from '../../utils/api';

// Сколько записей за месяц нужно, чтобы отчеты были точными
const GOOD_MONTH_ENTRIES = 15;
const FEW_MONTH_ENTRIES = 5;

const SectionLabel = ({ children }) => (
  <h2 className="text-xs font-bold text-[#F5E6D3]/70 uppercase tracking-wider px-1">{children}</h2>
);

// Чем чаще ведешь дневник, тем точнее отчеты — показываем, сколько записей уже есть
function DiaryAccuracy() {
  const { navigate } = useAppNav();
  const [count, setCount] = useState(null);

  useEffect(() => {
    api('/api/reports/entries-count?period=month').then(data => setCount(data.count)).catch(console.error);
  }, []);

  const hint = count === null ? '' : count < FEW_MONTH_ENTRIES
    ? 'Пока мало — отчеты получатся неточными. Записывай события и реакции каждый день.'
    : count < GOOD_MONTH_ENTRIES
      ? 'Неплохо. Чем чаще ведешь дневник, тем точнее отчеты.'
      : 'Отлично — отчетам хватает данных.';

  return (
    <section className="bg-rose-900/80 rounded-3xl p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-bold text-[#F5E6D3]">Дневник за 30 дней</h2>
        <span className="text-sm font-bold text-[#F5E6D3]/80 shrink-0">
          {count === null ? '…' : `${count} ${plural(count, ['запись', 'записи', 'записей'])}`}
        </span>
      </div>
      <div className="h-2 w-full bg-rose-950 rounded-full overflow-hidden mt-3 mb-3">
        <div className="h-full bg-emerald-700 transition-all duration-500" style={{ width: `${Math.min((count || 0) / GOOD_MONTH_ENTRIES, 1) * 100}%` }} />
      </div>
      <p className="text-sm text-[#F5E6D3]/75 leading-relaxed">{hint}</p>
      {count !== null && count < FEW_MONTH_ENTRIES && (
        <button onClick={() => navigate({ tab: 'diary' })} className="mt-3 flex items-center gap-1.5 text-sm font-bold text-[#F5E6D3]">
          <NotebookPen size={16} /> Записать в дневник
        </button>
      )}
    </section>
  );
}

// Баннер вида отчета ведет на его страницу; метка — новый отчет или дата последнего
function ReportTypeBanner({ type, reports, onOpen }) {
  const latest = reports[0];
  const hasNew = reports.some(r => r.is_read === false);
  return (
    <ClayBanner
      id={`report-${type.id}`}
      kind="report"
      title={type.bannerTitle || type.shortTitle}
      description={type.subtitle}
      image={type.image}
      onClick={onOpen}
      badge={hasNew ? 'Новый отчет' : latest ? `Последний — ${formatDay(latest.created_at)}` : undefined}
      badgeAccent={hasNew}
    />
  );
}

// Раздел отчетов («Поведенческий код» или «Профориентация»): точность по числу записей,
// баннеры видов отчетов и последние отчеты этого раздела
export default function ReportGroupSection({ group, reports, onOpenType, onOpenReport }) {
  const { profile } = useProfile();
  const { navigate } = useAppNav();
  if (!reports) return <Spinner />;

  const types = REPORT_TYPES.filter(t => t.group === group.id);
  const byType = (type) => reports.filter(r => reportTypeOf(r)?.id === type.id);
  const recent = reports.filter(r => types.some(t => t.id === reportTypeOf(r)?.id)).slice(0, 5);
  const needsCareerTests = group.id === 'career'
    && !profile?.categories?.find(c => c.name === 'Профориентация')?.tests.some(t => t.passed);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[#F5E6D3]/75 leading-relaxed px-1">{group.desc}</p>

      {needsCareerTests && (
        <section className="bg-rose-900/80 rounded-3xl p-5">
          <p className="text-sm text-[#F5E6D3]/80 mb-4">Эти отчеты строятся по тестам профориентации — сначала пройди их.</p>
          <button onClick={() => navigate({ tab: 'tests' })} className="w-full py-3.5 bg-emerald-800 text-[#F5E6D3] font-bold rounded-2xl">
            К тестам
          </button>
        </section>
      )}

      <DiaryAccuracy />

      <div className="flex flex-col gap-4">
        {types.map(type => (
          <ReportTypeBanner key={type.id} type={type} reports={byType(type)} onOpen={() => onOpenType(type)} />
        ))}
      </div>

      {recent.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionLabel>Последние отчеты</SectionLabel>
          <div className="bg-rose-900/60 rounded-3xl divide-y divide-[#F5E6D3]/10 overflow-hidden">
            {recent.map(report => (
              <button key={report.id} onClick={() => onOpenReport(report)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
                <FileText size={20} className="shrink-0 text-[#F5E6D3]/80" />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 text-[#F5E6D3] font-medium">
                    <span className="truncate">{reportTypeOf(report)?.shortTitle || 'Отчет'}</span>
                    {report.is_read === false && (
                      <span className="shrink-0 text-[10px] font-bold text-rose-950 bg-[#e5c398] px-2 py-0.5 rounded-full">Новый</span>
                    )}
                  </span>
                  <span className="block text-xs text-[#F5E6D3]/60 mt-0.5">{formatDay(report.created_at)} · {periodLabel(report)}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-[#F5E6D3]/60" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
