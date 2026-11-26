import { apiHeaders, clearSession, getSession, onSessionChange } from './platform';

// Страница и API используют один домен: путь выбирает сервер при входе, а не проба скорости.
// Это сохраняет выбранный путь и в браузере, и в Telegram, включая потоковые ответы и аватарки.

// Запросы первого экрана отправляем при запуске вместе с профилем, а не после него: экран заберет готовый ответ.
// Ответ живет недолго — позже экран спросит сервер заново
const PREFETCH_TTL_MS = 15000;
const prefetched = new Map();
onSessionChange(() => prefetched.clear());

// Сессия браузера закончилась или её отозвали — приложение вернётся на экран входа
function checkSession(res, session) {
  if (res.status === 401 && session && session === getSession()) clearSession({ announce: false });
}

// Запрос к API от имени пользователя Telegram. Ошибка HTTP становится исключением с текстом detail от бэкенда.
// Blob (запись диктовки) уходит как есть, остальное — JSON
export async function api(path, { method = 'GET', body, headers: extraHeaders } = {}) {
  if (method === 'GET') {
    const ready = takePrefetched(path);
    if (ready) return ready;
  }
  const raw = body instanceof Blob;
  const session = getSession();
  const headers = { ...apiHeaders(), ...extraHeaders };
  if (body !== undefined) headers['Content-Type'] = raw ? body.type || 'application/octet-stream' : 'application/json';

  const res = await fetch(path, {
    method,
    headers,
    cache: 'no-store',
    body: raw || body === undefined ? body : JSON.stringify(body),
  });
  checkSession(res, session);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(data?.detail || `Ошибка сервера (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export function prefetch(path) {
  if (prefetched.has(path)) return;
  const promise = api(path);
  promise.catch(() => {});
  prefetched.set(path, { promise, at: Date.now() });
}

function takePrefetched(path) {
  const entry = prefetched.get(path);
  prefetched.delete(path);
  return entry && Date.now() - entry.at < PREFETCH_TTL_MS ? entry.promise : null;
}

// Долгие запросы к ИИ: бэкенд держит соединение пробелами и в конце присылает JSON.
// Ошибка приходит либо статусом (например, 402 — не хватает баланса), либо полем detail
export async function apiStream(path, body) {
  const session = getSession();
  const res = await fetch(path, {
    method: 'POST',
    headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  checkSession(res, session);
  const text = await res.text();
  const start = text.indexOf('{');
  const data = start === -1 ? null : JSON.parse(text.slice(start));
  if (!res.ok || !data || data.detail) {
    const error = new Error(data?.detail || `Ошибка сервера (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export async function apiBlob(path, { signal } = {}) {
  const session = getSession();
  const res = await fetch(path, { method: 'GET', headers: apiHeaders(), cache: 'no-store', signal });
  checkSession(res, session);
  if (!res.ok) throw new Error(`Ошибка сервера (${res.status})`);
  return res.blob();
}
