import { ArrowUpRight, ChevronDown } from 'lucide-react';
import './reports.css';

export default function ReportBanner({ report, expanded, onClick, summary }) {
  const interactive = typeof onClick === 'function';
  const Container = interactive ? 'button' : 'div';
  const Heading = interactive ? 'h3' : 'h2';
  const titleId = `report-banner-title-${report.id}`;
  const descriptionId = `report-banner-description-${report.id}`;

  return (
    <Container
      className={`report-banner report-banner--${report.id}`}
      {...(interactive ? {
        type: 'button',
        onClick,
        'aria-expanded': expanded,
        'aria-controls': `report-panel-${report.id}`,
        'aria-labelledby': titleId,
        'aria-describedby': descriptionId,
      } : {})}
    >
      <img
        className="report-banner__art"
        src={report.image}
        alt=""
        width="960"
        height="400"
        decoding="async"
        draggable="false"
      />
      {/* Название вылеплено в изображении; текст сохраняет семантику для скринридеров. */}
      <Heading className="sr-only" id={titleId}>{report.shortTitle}</Heading>
      <p className="sr-only" id={descriptionId}>
        {report.subtitle}{summary ? `. ${summary}` : ''}
      </p>
      {interactive && (
        <>
          {summary && <span className="report-banner__new" aria-hidden="true" />}
          <span className="report-banner__action" aria-hidden="true">
            {expanded ? <ChevronDown size={17} /> : <ArrowUpRight size={17} />}
          </span>
        </>
      )}
    </Container>
  );
}
