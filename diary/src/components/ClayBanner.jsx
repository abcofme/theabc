import { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp } from './ClayIcon';
import { useTheme } from '../context/theme';
import './clay-banner.css';

const artwork = import.meta.glob('../assets/{profile,reports,tests}/*-handmade*.webp', { eager: true, query: '?url', import: 'default' });
const lightArtwork = Object.fromEntries(Object.entries(artwork)
  .filter(([path]) => path.endsWith('-handmade.webp'))
  .map(([path, url]) => [url, artwork[path.replace('.webp', '-light.webp')]]));

// У отчетов и портрета остаются обложка и стрелка; подписи категорий тестов — под артом.
// meta и aside заменяют стандартную строку под артом (слева и справа от стрелки)
export default function ClayBanner({ id, title, description, image, expanded, onClick, controlsId, badge, badgeAccent = false, kind, chevron = false, disabled = false, locked = false, meta, aside }) {
  const { theme } = useTheme();
  const [isLoaded, setIsLoaded] = useState(false);
  const interactive = typeof onClick === 'function';
  const minimal = kind === 'report' || kind === 'profile';
  const Container = interactive ? 'button' : 'div';
  const Heading = interactive ? 'h3' : 'h2';
  const titleId = `clay-banner-title-${id}`;
  const descriptionId = `clay-banner-description-${id}`;
  const ActionIcon = expanded ? ChevronUp : chevron ? ChevronDown : ChevronRight;
  const left = meta ?? (badge ? <span className={`clay-banner__badge ${badgeAccent ? 'clay-banner__badge--accent' : ''}`}>{badge}</span> : <span className="clay-banner__caption">{description}</span>);
  const hasMeta = !minimal && (interactive || badge || meta || aside);

  return (
    <Container
      className={`clay-banner${minimal ? ' clay-banner--minimal' : ''}`}
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
        src={theme === 'light' ? lightArtwork[image] || image : image} alt="" width="960" height="400" decoding="async" draggable="false"
      />
      {/* The sculpted heading is baked into the art; retain one accessible text label. */}
      <Heading className="sr-only" id={titleId}>{title}</Heading>
      <p className="sr-only" id={descriptionId}>
        {[description, badge].filter(Boolean).join('. ')}
      </p>
      {minimal && interactive && <span className="clay-banner__arrow" aria-hidden="true"><ActionIcon size={22} /></span>}
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
