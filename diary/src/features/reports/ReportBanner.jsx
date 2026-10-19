import ClayBanner from '../../components/ClayBanner';
import './reports.css';

export default function ReportBanner({ report, expanded, onClick, summary }) {
  return (
    <ClayBanner
      id={`report-${report.id}`}
      kind="report"
      title={report.bannerTitle || report.shortTitle}
      description={report.subtitle}
      image={report.image}
      expanded={expanded}
      onClick={onClick}
      controlsId={`report-panel-${report.id}`}
      summary={summary}
    />
  );
}
