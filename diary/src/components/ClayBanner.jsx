import { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import './clay-banner.css';

// Художественная надпись остается в изображении; статус и управление — под ним.
// meta и aside заменяют стандартную строку под артом (слева и справа от стрелки)
export default function ClayBanner({ id, title, description, image, expanded, onClick, controlsId, badge, badgeAccent = false, kind, chevron = false, disabled = false, locked = false, meta, aside }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const interactive = typeof onClick === 'function';
  const Container = interactive ? 'button' : 'div';
  const Heading = interactive ? 'h3' : 'h2';
  const titleId = `clay-banner-title-${id}`;
  const descriptionId = `clay-banner-description-${id}`;
  const ActionIcon = expanded ? ChevronUp : chevron ? ChevronDown : ChevronRight;
  const left = meta ?? (badge ? <span className={`clay-banner__badge ${badgeAccent ? 'clay-banner__badge--accent' : ''}`}>{badge}</span> : <span className="clay-banner__caption">{description}</span>);
  const hasMeta = interactive || badge || meta || aside;

  return (
    <Container
      className="clay-banner"
      data-banner-kind={kind}
      data-locked={locked || undefined}
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
      <img
        className={`clay-banner__art ${isLoaded ? 'is-loaded' : ''}`}
        ref={img => { if (img?.complete && img.naturalWidth && !isLoaded) setIsLoaded(true); }}
        onLoad={() => setIsLoaded(true)}
        src={image} alt="" width="960" height="400" decoding="async" draggable="false"
      />
      {/* The sculpted heading is baked into the art; retain one accessible text label. */}
      <Heading className="sr-only" id={titleId}>{title}</Heading>
      <p className="sr-only" id={descriptionId}>
        {[description, badge].filter(Boolean).join('. ')}
      </p>
      {hasMeta && (
        <span className="clay-banner__meta" aria-hidden="true">
          <span className="clay-banner__left">{left}</span>
          {aside}
          {interactive && <ActionIcon size={20} className="shrink-0" />}
        </span>
      )}
    </Container>
  );
}
