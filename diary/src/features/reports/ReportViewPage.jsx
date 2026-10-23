import { RefreshCw, Trash2 } from '../../components/ClayIcon';
import Page from '../../components/Page';
import ClayBanner from '../../components/ClayBanner';
import ResultContent from '../../components/ResultContent';
import { reportTypeOf, formatDay, periodLabel } from './reportTypes';

// Чтение отчета: обложка вида, вопрос и период, текст; в конце — обновить или удалить
export default function ReportViewPage({ report, onBack, onUpdate, onDelete }) {
  const type = reportTypeOf(report);
  return (
    <Page title={type?.shortTitle || 'Отчет'} onBack={onBack} clayTitle>
      <div className="ui-stack">
        <header>
          {type && <ClayBanner id={`report-view-${report.id}`} kind="report" title={type.shortTitle} description={type.subtitle} image={type.image} />}
          {type?.question && <p className="report-question">{type.question}</p>}
          <p className="ui-secondary mt-2 px-1">Отчет от {formatDay(report.created_at)} · {periodLabel(report)}</p>
        </header>
        <ResultContent content={report.content} titles={[report.title, type?.shortTitle]} contents={false} variant="document" clayHeadings />
        <div className="flex flex-col gap-2 border-t border-[var(--ui-text)]/10 pt-6">
          {type && <button type="button" onClick={onUpdate} className="ui-button ui-button--outline"><RefreshCw size={20} /> Обновить отчет</button>}
          <button type="button" onClick={onDelete} className="ui-button ui-button--quiet"><Trash2 size={20} /> Удалить отчет</button>
        </div>
      </div>
    </Page>
  );
}
