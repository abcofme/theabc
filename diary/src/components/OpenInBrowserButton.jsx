import { useCallback, useEffect, useRef, useState } from 'react';
import { Send } from './ClayIcon';
import { api } from '../utils/api';

// Ссылка на вход действует 10 минут. Обновляем её заранее, чтобы открыть браузер прямо из нажатия.
const LINK_REFRESH_MS = 9 * 60 * 1000;

export default function OpenInBrowserButton({ query, label = 'Открыть в браузере' }) {
  const [link, setLink] = useState(null);
  const [error, setError] = useState(null);
  const requestInProgress = useRef(false);

  const requestLink = useCallback(() => {
    if (requestInProgress.current) return;
    requestInProgress.current = true;
    api('/api/auth/handoff', { method: 'POST' })
      .then(({ code }) => {
        setLink({ code, refreshAt: Date.now() + LINK_REFRESH_MS });
        setError(null);
      })
      .catch(err => {
        setLink(null);
        setError(err.message || 'Не удалось подготовить ссылку');
      })
      .finally(() => { requestInProgress.current = false; });
  }, []);

  useEffect(() => { requestLink(); }, [requestLink]);

  useEffect(() => {
    if (!link) return;
    const refresh = setTimeout(requestLink, Math.max(0, link.refreshAt - Date.now()));
    return () => clearTimeout(refresh);
  }, [link, requestLink]);

  const open = () => {
    if (link && Date.now() < link.refreshAt) {
      const url = new URL(window.location.origin);
      url.search = new URLSearchParams({ ...query, login: link.code }).toString();
      window.Telegram.WebApp.openLink(url.toString());
    }
    setLink(null);
    setError(null);
    requestLink();
  };

  return <>
    <button type="button" onClick={open} disabled={!link && !error} className="ui-button ui-button--primary">
      <Send size={20} aria-hidden="true" /> {error ? 'Попробовать снова' : link ? label : 'Готовлю ссылку…'}
    </button>
    {error && <p className="ui-secondary text-center mt-3" role="alert">{error}</p>}
  </>;
}
