import { ArrowRight, ChevronRight, FileText } from 'lucide-react';
import ClayBanner from '../../components/ClayBanner';
import Spinner from '../../components/Spinner';
import { REPORT_TYPES, reportTypeOf, formatDay, periodLabel } from './reportTypes';
import { plural } from '../diary/utils';
import { useAppNav } from '../../navigation/appNav';
import { useProfile } from '../../context/profile';

export default function ReportGroupSection({ group, reports, jobs, onOpenType, onOpenReport }) {
  const { profile } = useProfile();
  const { navigate } = useAppNav();
  if (!reports) return <Spinner />;
  const types = REPORT_TYPES.filter(t => t.group === group.id);
  const recent = reports.filter(r => types.some(t => t.id === reportTypeOf(r)?.id)).slice(0, 5);
  const [latest, ...earlier] = recent;
  const needsCareerTests = group.id === 'career' && !profile?.categories?.find(c => c.name === 'Профориентация')?.tests.some(t => t.passed);
  return (
    <div className="ui-stack">
      {latest && (
        <section>
          <h2 className="ui-section-label mb-3">{latest.is_read === false ? 'Новый отчет' : 'Последний отчет'}</h2>
          <div className="ui-card">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="text-lg leading-6 font-semibold">{reportTypeOf(latest)?.shortTitle || 'Отчет'}</h3>
              {latest.is_read === false && <span className="ui-badge">Новый</span>}
            </div>
            <p className="ui-secondary mb-5">{formatDay(latest.created_at)} · {periodLabel(latest)}</p>
            <button type="button" onClick={() => onOpenReport(latest)} className="ui-button ui-button--primary">Открыть отчет <ArrowRight size={20} /></button>
          </div>
          {earlier.length > 0 && (
            <details className="mt-2">
              <summary className="ui-secondary py-3">Еще {earlier.length} {plural(earlier.length, ['отчет', 'отчета', 'отчетов'])}{earlier.some(report => report.is_read === false) ? ' · есть новые' : ''}</summary>
              {earlier.map(report => <button type="button" key={report.id} onClick={() => onOpenReport(report)} className="ui-row">
                <FileText size={20} className="shrink-0 text-[#F5E6D3]/75" />
                <span className="flex-1 min-w-0"><span className="flex gap-2 items-center"><span className="font-medium">{reportTypeOf(report)?.shortTitle || 'Отчет'}</span>{report.is_read === false && <span className="ui-badge">Новый</span>}</span><span className="ui-muted block mt-1">{formatDay(report.created_at)} · {periodLabel(report)}</span></span>
                <ChevronRight size={20} className="shrink-0" />
              </button>)}
            </details>
          )}
        </section>
      )}
      {needsCareerTests && (
        <section className="ui-card">
          <p className="ui-secondary mb-4">Эти отчеты строятся по тестам профориентации — сначала пройди их.</p>
          <button type="button" onClick={() => navigate({ tab: 'tests', category: 'Профориентация' })} className="ui-button ui-button--primary">К тестам профориентации</button>
        </section>
      )}
      <section className="flex flex-col gap-4" aria-label="Виды отчетов">
        {types.map(type => {
          const existing = reports.filter(r => reportTypeOf(r)?.id === type.id);
          const hasNew = existing.some(r => r.is_read === false);
          return <ClayBanner key={type.id} id={`report-${type.id}`} kind="report" title={type.bannerTitle || type.shortTitle} description={type.subtitle} image={type.image} onClick={() => onOpenType(type)} badge={jobs?.[type.id] ? 'Формируется…' : hasNew ? 'Новый отчет' : existing[0] ? `Последний — ${formatDay(existing[0].created_at)}` : undefined} badgeAccent={hasNew} />;
        })}
      </section>
    </div>
  );
}
