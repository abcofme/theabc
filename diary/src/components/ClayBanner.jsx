import { ArrowUpRight, ChevronDown, ChevronUp } from 'lucide-react';
import './clay-banner.css';

export default function ClayBanner({ id, title, description, image, expanded, onClick, controlsId, summary, kind, chevron = false, disabled = false }) {
  const interactive = typeof onClick === 'function';
  const Container = interactive ? 'button' : 'div';
  const Heading = interactive ? 'h3' : 'h2';
  const titleId = `clay-banner-title-${id}`;
  const descriptionId = `clay-banner-description-${id}`;
  const ActionIcon = expanded ? ChevronUp : chevron ? ChevronDown : ArrowUpRight;

  return (
    <Container
      className="clay-banner"
      data-banner-kind={kind}
      {...(interactive ? {
        type: 'button',
        onClick,
        disabled,
        'aria-expanded': expanded,
        'aria-controls': controlsId,
        'aria-labelledby': titleId,
        'aria-describedby': descriptionId,
      } : {})}
    >
      <img className="clay-banner__art" src={image} alt="" width="960" height="400" decoding="async" draggable="false" />
      {/* The sculpted heading is baked into the art; retain one accessible text label. */}
      <Heading className="sr-only" id={titleId}>{title}</Heading>
      <p className="sr-only" id={descriptionId}>
        {description}{summary ? `. ${summary}` : ''}
      </p>
      {interactive && (
        <>
          {summary && <span className="clay-banner__new" aria-hidden="true" />}
          <span className="clay-banner__action" aria-hidden="true"><ActionIcon size={17} /></span>
        </>
      )}
    </Container>
  );
}
