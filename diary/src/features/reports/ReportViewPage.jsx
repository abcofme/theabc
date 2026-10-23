import Page from '../../components/Page';
import ResultContent from '../../components/ResultContent';
import { reportTypeOf, formatDay, periodLabel } from './reportTypes';

export default function ReportViewPage({ report, onBack }) {
  const type = reportTypeOf(report);
  return (
    <Page title={type?.shortTitle || 'Отчет'} onBack={onBack}>
      <p className="ui-secondary mb-6">Отчет от {formatDay(report.created_at)} · {periodLabel(report)}</p>
      <ResultContent content={report.content} titles={[report.title, type?.shortTitle]} />
    </Page>
  );
}
