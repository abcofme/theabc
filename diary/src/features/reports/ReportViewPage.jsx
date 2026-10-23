import Page from '../../components/Page';
import ResultContent from '../../components/ResultContent';
import { reportTypeOf, formatDay, periodLabel } from './reportTypes';

export default function ReportViewPage({ report, onBack }) {
  return (
    <Page title={reportTypeOf(report)?.shortTitle || 'Отчет'} onBack={onBack}>
      <p className="ui-secondary mb-6">Отчет от {formatDay(report.created_at)} · {periodLabel(report)}</p>
      <ResultContent content={report.content} />
    </Page>
  );
}
