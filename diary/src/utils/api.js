const WebApp = window.Telegram.WebApp;
const API_URL = window.location.origin;

// Запрос к API от имени пользователя Telegram. Ошибка HTTP становится исключением с текстом detail от бэкенда
export async function api(path, { method = 'GET', body } = {}) {
  const headers = { Authorization: `Bearer ${WebApp.initData}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(data?.detail || `Ошибка сервера (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

// Долгие запросы к ИИ: бэкенд держит соединение пробелами и в конце присылает JSON.
// Ошибка приходит либо статусом (например, 402 — не хватает баланса), либо полем detail
export async function apiStream(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WebApp.initData}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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
