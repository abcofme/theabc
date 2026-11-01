import { useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import ClayText from './ClayText';
import { ArrowLeft } from './ClayIcon';
import logo from '../assets/logo.webp';
import { useBackStack } from '../navigation/backStack';
import { isTelegram } from '../utils/platform';

const WebApp = window.Telegram.WebApp;
const events = ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged'];

// Шапка находится между нативными кнопками Telegram, а экраны начинаются под ней.
// В браузере кнопок Telegram нет: шапка своя, с кнопкой «Назад», пока открыт экран поверх вкладок
export default function TelegramChrome() {
  if (!isTelegram) return <BrowserChrome />;
  return <TelegramHeader />;
}

function Brand() {
  return (
    <div className="telegram-brand" aria-label="Азбука Я">
      <img src={logo} alt="" width="32" height="32" draggable="false" />
      <ClayText text="Азбука Я" aria-hidden="true" />
    </div>
  );
}

function BrowserChrome() {
  const { depth, back } = useBackStack();
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.browserChrome = 'true';
    return () => { delete root.dataset.browserChrome; };
  }, []);

  return createPortal(
    <>
      <Brand />
      {depth > 0 && (
        <button type="button" onClick={back} aria-label="Назад" className="browser-back ui-icon-button">
          <ArrowLeft size={24} />
        </button>
      )}
    </>,
    document.body,
  );
}

function TelegramHeader() {
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

  return createPortal(<Brand />, document.body);
}
