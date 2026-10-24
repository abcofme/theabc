const WebApp = window.Telegram.WebApp;

// Мини-апп открывается через NL: из РФ режут ответы московского сервера на адреса многих VPN.
// Если прямой путь в Москву быстрый, запросы к API идут напрямую, иначе — через домен страницы
const RELAY_URL = window.location.origin;
const DIRECT_URL = import.meta.env.VITE_DIRECT_API_URL;
// Холодное соединение: DNS, TCP и TLS. Дольше — прямой путь считаем медленным
const PROBE_TIMEOUT_MS = 2000;
// Обычный запрос по прямому пути дольше этого — зависание, повторяем через NL
const DIRECT_GET_TIMEOUT_MS = 8000;

let useDirect = false;
let directFailed = false;

function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Пробу шлём сразу при загрузке, а первые запросы идут через NL — соединение туда уже открыто страницей
if (DIRECT_URL && DIRECT_URL !== RELAY_URL) {
  fetchWithTimeout(`${DIRECT_URL}/api/health`, { cache: 'no-store' }, PROBE_TIMEOUT_MS)
    .then((res) => { if (res.ok && !directFailed) useDirect = true; })
    .catch(() => {});
}

// Сетевая ошибка или зависание прямого пути — до конца сессии ходим через NL.
// Повторяем сразу только GET: POST мог дойти до сервера, повтор списал бы баланс дважды
async function request(path, init, timeoutMs) {
  if (useDirect) {
    try {
      return timeoutMs
        ? await fetchWithTimeout(`${DIRECT_URL}${path}`, init, timeoutMs)
        : await fetch(`${DIRECT_URL}${path}`, init);
    } catch (error) {
      useDirect = false;
      directFailed = true;
      if (init.method !== 'GET') throw error;
    }
  }
  return fetch(`${RELAY_URL}${path}`, init);
}

// Запрос к API от имени пользователя Telegram. Ошибка HTTP становится исключением с текстом detail от бэкенда
export async function api(path, { method = 'GET', body } = {}) {
  const headers = { Authorization: `Bearer ${WebApp.initData}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await request(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }, method === 'GET' ? DIRECT_GET_TIMEOUT_MS : null);
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
  const res = await request(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WebApp.initData}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, null);
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
