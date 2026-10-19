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
