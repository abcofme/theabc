import { ChevronRight, FileText, LoaderCircle, Lock } from '../../components/ClayIcon';
import ClayBanner from '../../components/ClayBanner';
import ClayText from '../../components/ClayText';
import Spinner from '../../components/Spinner';
import { REPORT_GROUPS, REPORT_TYPES, reportTypeOf, formatDay } from './reportTypes';
import { groupLock } from './reportHelpers';
import useNewEntries from './useNewEntries';
import { plural } from '../diary/utils';
import { useProfile } from '../../context/profile';

const entriesText = (n) => `${n} ${plural(n, ['запись', 'записи', 'записей'])}`;

// Обложка вида отчета; под ней — статус последнего отчета и сколько записей добавилось с тех пор
function TypeCard({ type, reports, lock, isGenerating, newCount, onOpen }) {
  const latest = reports.find(r => reportTypeOf(r)?.id === type.id);
  const isNew = latest?.is_read === false;
  const status = lock ? lock.label
    : isGenerating ? 'Формируется…'
    : isNew ? 'Новый отчет'
    : latest ? `Последний — ${formatDay(latest.created_at)}`
    : type.subtitle;
  const showNew = !lock && latest && newCount > 0;
  const meta = isNew && !lock && !isGenerating
    ? <span className="clay-banner__badge clay-banner__badge--accent">{status}</span>
    : <>{lock && <Lock size={14} className="shrink-0" />}<span className="clay-banner__caption">{status}</span></>;
  return (
    <ClayBanner
      id={`report-${type.id}`}
      kind="report"
      title={type.shortTitle}
      description={[type.subtitle, status !== type.subtitle && status, showNew && `с тех пор ${entriesText(newCount)}`].filter(Boolean).join('. ')}
      image={type.image}
      onClick={onOpen}
      locked={!!lock}
      meta={meta}
      aside={showNew ? <span className="clay-banner__chip">+{entriesText(newCount)}</span> : null}
    />
  );
}

// «Обо мне»: что готово или формируется — сверху, ниже обе группы отчетов с обложками видов
export default function ReportsCatalog({ reports, jobs, active, onOpenType, onOpenReport }) {
  const { profile } = useProfile();
  const newEntries = useNewEntries(reports, active);
  if (!reports) return <Spinner />;
  const unread = reports.filter(r => r.is_read === false && reportTypeOf(r)).slice(0, 2);
  const generating = REPORT_TYPES.filter(t => jobs[t.id]);

  return (
    <div className="ui-stack">
      {(generating.length > 0 || unread.length > 0) && (
        <div className="flex flex-col gap-2">
          {generating.map(type => (
            <button key={type.id} type="button" onClick={() => onOpenType(type)} className="report-strip">
              <LoaderCircle size={20} className="shrink-0 animate-spin text-[var(--ui-gold)]" aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <span className="report-strip__label">Отчет формируется</span>
                <span className="block font-semibold">{type.shortTitle}</span>
                <span className="ui-muted block mt-0.5">Можно закрыть приложение — пришлем сообщение, когда он будет готов</span>
              </span>
            </button>
          ))}
          {unread.map(report => (
            <button key={report.id} type="button" onClick={() => onOpenReport(report)} className="report-strip">
              <FileText size={20} className="shrink-0 text-[var(--ui-gold)]" aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <span className="report-strip__label">Готов новый отчет</span>
                <span className="block font-semibold">{reportTypeOf(report).shortTitle}</span>
              </span>
              <ChevronRight size={20} className="shrink-0" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      {REPORT_GROUPS.map(group => {
        const lock = groupLock(group.id, profile);
        return (
          <section key={group.id} id={`reports-group-${group.id}`} className="flex flex-col gap-4 scroll-mt-4" aria-labelledby={`reports-group-title-${group.id}`}>
            <header className="px-1">
              <ClayText as="h2" id={`reports-group-title-${group.id}`} text={group.title} className="report-group-title" />
            </header>
            {REPORT_TYPES.filter(t => t.group === group.id).map(type => (
              <TypeCard
                key={type.id}
                type={type}
                reports={reports}
                lock={lock}
                isGenerating={!!jobs[type.id]}
                newCount={newEntries[type.id]}
                onOpen={() => onOpenType(type)}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}
