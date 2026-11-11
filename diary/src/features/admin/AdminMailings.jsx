import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from '../../components/ClayIcon';
import ScreenState from '../../components/ScreenState';
import { api } from '../../utils/api';

const ENDPOINT = '/api/admin/mailings';
const MESSAGE_LIMIT = 4096;
const dateTime = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow',
});

function MailingResult({ mailing }) {
  const { pending = 0, sending = 0, sent = 0, failed = 0, unconfirmed = 0 } = mailing.counts;
  const total = pending + sending + sent + failed + unconfirmed;
  let status = 'Завершена';
  if (total === 0) status = 'Нет получателей';
  else if (sending > 0 || (pending > 0 && pending < total)) status = 'Отправляется';
  else if (pending > 0) status = 'В очереди';

  return (
    <li className="ui-card space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold">{status}</span>
        <time className="ui-muted" dateTime={mailing.created_at}>{dateTime.format(new Date(mailing.created_at))} МСК</time>
      </div>
      <p className="whitespace-pre-wrap break-words">{mailing.text}</p>
      {total > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm ui-secondary">
          <span>Доставлено {sent} из {total}</span>
          {failed > 0 && <span>Не доставлено {failed}</span>}
          {unconfirmed > 0 && <span>Доставка не подтверждена {unconfirmed}</span>}
        </div>
      )}
    </li>
  );
}

export default function AdminMailings({ active }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const sending = useRef(false);
  const lastSubmission = useRef(null);
  const [feedback, setFeedback] = useState(null);
  const [mailings, setMailings] = useState(null);
  const [historyError, setHistoryError] = useState(false);
  const refreshVersion = useRef(0);

  const load = useCallback(() => {
    const version = ++refreshVersion.current;
    return api(ENDPOINT).then(data => {
      if (version !== refreshVersion.current) return;
      setMailings(data);
      setHistoryError(false);
    }).catch(() => {
      if (version === refreshVersion.current) setHistoryError(true);
    });
  }, []);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  useEffect(() => {
    if (!active || historyError || !mailings?.some(({ counts }) => counts.pending || counts.sending)) return;
    const timer = setTimeout(load, 5000);
    return () => clearTimeout(timer);
  }, [active, historyError, load, mailings]);

  function showPreview(event) {
    event.preventDefault();
    const message = text.trim();
    if (!message) return;
    if (lastSubmission.current?.text !== message) {
      lastSubmission.current = { id: crypto.randomUUID(), text: message };
    }
    setFeedback(null);
    setPreview(lastSubmission.current);
  }

  async function sendMailing() {
    if (sending.current) return;
    sending.current = true;
    setIsSending(true);
    setFeedback(null);
    try {
      await api(ENDPOINT, { method: 'POST', body: preview });
      setText('');
      setPreview(null);
      lastSubmission.current = null;
      setFeedback({ text: 'Рассылка поставлена в очередь.' });
      load();
    } catch (error) {
      setFeedback({ error: true, text: error.status ? error.message : 'Не удалось получить ответ. Повторите отправку.' });
    } finally {
      sending.current = false;
      setIsSending(false);
    }
  }

  return (
    <div className="ui-stack">
      <form onSubmit={showPreview} className="ui-card flex flex-col gap-4">
        <h3 className="text-lg font-bold">Новая рассылка</h3>
        {preview ? (
          <>
            <div>
              <p className="text-sm font-medium mb-2">Предпросмотр сообщения</p>
              <p className="whitespace-pre-wrap break-words rounded-xl bg-[var(--ui-subtle)] p-3">{preview.text}</p>
            </div>
            <p className="text-sm ui-secondary">Сообщение придёт пользователям бота в Telegram.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" className="ui-button ui-button--secondary" disabled={isSending} onClick={() => { setPreview(null); setFeedback(null); }}>Редактировать</button>
              <button type="button" className="ui-button ui-button--primary" disabled={isSending} onClick={sendMailing}>
                {isSending ? 'Отправляем…' : 'Отправить рассылку'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2 text-sm">
              <label htmlFor="mailing-text" className="font-medium">Текст сообщения</label>
              <textarea
                id="mailing-text"
                aria-describedby="mailing-text-length"
                value={text}
                onChange={event => setText(event.target.value)}
                maxLength={MESSAGE_LIMIT}
                rows={6}
                className="w-full resize-y rounded-xl bg-[var(--ui-subtle)] p-3"
              />
              <span id="mailing-text-length" className="self-end ui-muted">{text.length} / {MESSAGE_LIMIT}</span>
            </div>
            <button type="submit" className="ui-button ui-button--primary self-start" disabled={!text.trim()}>Предпросмотр</button>
          </>
        )}
        {feedback && <p className="text-sm" role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
      </form>

      <section className="flex flex-col gap-3" aria-labelledby="mailing-history-title">
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <h3 id="mailing-history-title" className="text-lg font-bold">История рассылок</h3>
          <button type="button" onClick={load} aria-label="Обновить рассылки" className="ui-icon-button">
            <RefreshCw size={20} />
          </button>
        </div>
        {historyError ? <ScreenState error title="Не удалось загрузить рассылки" onRetry={load} /> :
          mailings === null ? <ScreenState loading /> :
          mailings.length === 0 ? <ScreenState title="Рассылок пока нет" /> : (
            <ul className="flex flex-col gap-3">
              {mailings.map(mailing => <MailingResult key={mailing.id} mailing={mailing} />)}
            </ul>
          )}
      </section>
    </div>
  );
}
