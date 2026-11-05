import { useCallback, useEffect, useRef, useState } from 'react';
import ClayText from '../../components/ClayText';
import { LoaderCircle, Send } from '../../components/ClayIcon';
import logo from '../../assets/logo.webp';
import { api } from '../../utils/api';
import { saveSession } from '../../utils/platform';

const POLL_INTERVAL = 2000;
// Неиспользованный код меняем за минуту до конца срока: ссылка в бота всегда рабочая
const CODE_REFRESH_MARGIN = 60 * 1000;

// Вход вне Telegram: ссылка ведет в бота, там пользователь подтверждает вход, а экран ждет подтверждения
// (backend/web_auth.py). Код берем заранее, чтобы кнопка была обычной ссылкой — ее не блокирует браузер
export default function LoginScreen({ notice }) {
  const [mode, setMode] = useState('telegram');
  const [login, setLogin] = useState(null); // { code, secret, url, expiresAt }
  const [isWaiting, setIsWaiting] = useState(false);
  const [message, setMessage] = useState(notice || null);

  const requestCode = useCallback(() => api('/api/auth/login', { method: 'POST' })
    .then(data => setLogin({ ...data, expiresAt: Date.now() + data.expires_in * 1000 }))
    .catch(() => {
      setLogin(null);
      setMessage('Не удалось подготовить вход. Проверь интернет и попробуй еще раз.');
    }), []);

  useEffect(() => { requestCode(); }, [requestCode]);

  useEffect(() => {
    if (!login || isWaiting) return;
    const timer = setTimeout(requestCode, Math.max(0, login.expiresAt - Date.now() - CODE_REFRESH_MARGIN));
    return () => clearTimeout(timer);
  }, [login, isWaiting, requestCode]);

  // После перехода в бота спрашиваем, подтвержден ли вход: по таймеру и сразу при возвращении на страницу
  useEffect(() => {
    if (!isWaiting || !login) return;
    let isChecking = false;
    const check = async () => {
      if (isChecking) return;
      isChecking = true;
      try {
        const data = await api('/api/auth/login/check', { method: 'POST', body: { code: login.code, secret: login.secret } });
        if (data.status === 'ok') saveSession(data);
        else if (data.status === 'expired') {
          setIsWaiting(false);
          setMessage('Время на вход вышло — нажми кнопку еще раз.');
          requestCode();
        }
      } catch (err) {
        if (err.status === 403) { setIsWaiting(false); setMessage(err.message); }
      } finally { isChecking = false; }
    };
    const timer = setInterval(check, POLL_INTERVAL);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [isWaiting, login, requestCode]);

  const startWaiting = () => { setMessage(null); setIsWaiting(true); };

  return (
    <div className="login-screen justify-start!">
      <div className="w-full max-w-sm mx-auto my-auto flex flex-col items-center text-center gap-6">
        <img src={logo} alt="" width="96" height="96" className="login-screen__logo" draggable="false" />
        <div>
          <h1 className="screen-title"><ClayText text="Азбука Я" /></h1>
          <p className="ui-secondary mt-2">Личный дневник, психологические тесты и отчеты о себе</p>
        </div>

        <div className="ui-segmented w-full" aria-label="Способ входа">
          <button type="button" aria-pressed={mode === 'telegram'} onClick={() => setMode('telegram')}>Telegram</button>
          <button type="button" aria-pressed={mode === 'password'} onClick={() => setMode('password')}>Логин и пароль</button>
        </div>
        {mode === 'password' ? <PasswordLogin /> : <section className="ui-card w-full text-left">
          <h2 className="text-lg font-semibold mb-2">Вход через Telegram</h2>
          <p className="ui-secondary mb-5">
            {isWaiting
              ? 'В Telegram открылся наш бот — нажми там «Войти». Дневник откроется здесь сам.'
              : 'Аккаунт тот же, что в боте «Азбука Я»: записи, тесты и баланс сохранятся.'}
          </p>
          {isWaiting ? <>
            <p className="flex items-center justify-center gap-2 font-semibold min-h-12" role="status">
              <LoaderCircle size={20} className="animate-spin" /> Ждем подтверждения…
            </p>
            <a href={login.url} target="_blank" rel="noopener noreferrer" className="ui-button ui-button--quiet mt-1">Открыть бота еще раз</a>
          </> : login ? (
            <a href={login.url} target="_blank" rel="noopener noreferrer" onClick={startWaiting} className="ui-button ui-button--primary">
              <Send size={20} aria-hidden="true" /> Войти через Telegram
            </a>
          ) : message ? (
            <button type="button" onClick={() => { setMessage(null); requestCode(); }} className="ui-button ui-button--secondary">Повторить</button>
          ) : (
            <p className="flex justify-center min-h-12 items-center" role="status" aria-label="Загрузка"><LoaderCircle size={24} className="animate-spin" /></p>
          )}
          {message && <p className="ui-secondary text-center mt-4" role="alert">{message}</p>}
        </section>}
      </div>
    </div>
  );
}

function PasswordLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const lock = useRef(false);

  const submit = async event => {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const session = await api('/api/auth/password', { method: 'POST', body: { username: username.trim(), password } });
      setPassword('');
      saveSession(session);
    } catch (err) {
      setError(err.message || 'Не удалось войти. Попробуй еще раз.');
    } finally { lock.current = false; setBusy(false); }
  };

  return <form onSubmit={submit} className="ui-card w-full text-left">
    <h2 className="text-lg font-semibold mb-2">Вход по логину и паролю</h2>
    <p className="ui-secondary mb-5">Отдельный профиль для работы в браузере.</p>
    <label htmlFor="browser-login" className="ui-secondary block">Логин</label>
    <input id="browser-login" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={64} value={username} onChange={event => setUsername(event.target.value)} disabled={busy} className="ui-input mt-2 mb-4" />
    <label htmlFor="browser-password" className="ui-secondary block">Пароль</label>
    <input id="browser-password" name="password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} className="ui-input mt-2 mb-5" />
    {error && <p role="alert" className="ui-secondary mb-4">{error}</p>}
    <button type="submit" disabled={busy || !username.trim() || !password} className="ui-button ui-button--primary">{busy ? <><LoaderCircle size={20} className="animate-spin" /> Входим…</> : 'Войти'}</button>
  </form>;
}
