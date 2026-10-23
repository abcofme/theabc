import { useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import ClayText from './ClayText';
import logo from '../assets/logo.webp';

const WebApp = window.Telegram.WebApp;
const events = ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged'];

// Шапка находится между нативными кнопками Telegram, а экраны начинаются под ней.
export default function TelegramChrome() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      const mobile = ['android', 'ios'].includes(WebApp.platform);
      root.dataset.telegramFullscreen = String(mobile && (WebApp.isFullscreen || WebApp.contentSafeAreaInset?.top > 0));
      for (const [kind, insets] of [['safe', WebApp.safeAreaInset], ['content-safe', WebApp.contentSafeAreaInset]]) {
        for (const side of ['top', 'bottom', 'left', 'right']) {
          const value = insets?.[side];
          if (Number.isFinite(value)) root.style.setProperty(`--app-${kind}-${side}`, `${Math.max(0, value)}px`);
        }
      }
    };
    sync();
    events.forEach(event => WebApp.onEvent?.(event, sync));
    return () => {
      events.forEach(event => WebApp.offEvent?.(event, sync));
      delete root.dataset.telegramFullscreen;
      for (const kind of ['safe', 'content-safe']) {
        for (const side of ['top', 'bottom', 'left', 'right']) root.style.removeProperty(`--app-${kind}-${side}`);
      }
    };
  }, []);

  return createPortal(
    <div className="telegram-brand" aria-label="Азбука Я">
      <img src={logo} alt="" width="32" height="32" draggable="false" />
      <ClayText text="Азбука Я" aria-hidden="true" />
    </div>,
    document.body,
  );
}
