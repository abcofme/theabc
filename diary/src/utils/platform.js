import { showBrowserDialog } from './browserDialog';

const WebApp = window.Telegram.WebApp;

// Приложение открывается в Telegram (мини-апп) или в браузере — на сайте и как установленное на главный экран.
// В Telegram пользователя подтверждает подписанный initData, в браузере — сессия после входа через бота
export const isTelegram = Boolean(WebApp.initData);
export const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isMobile = isIOS || /Android/i.test(navigator.userAgent);

// Установленное на iPhone приложение со строкой состояния black-translucent: окно страницы короче экрана
// на высоту строки состояния, и под нижним меню остается пустая полоса. Меряем разницу и удлиняем на нее корень
// (--app-standalone-gap в index.css) — вместе с ним iOS растягивает и область для fixed-элементов: меню и страницы
// сами встают к краю экрана. Меряем без удлинения и только при запуске и повороте: иначе мерили бы сами себя
if (isIOS && isStandalone) {
  const root = document.documentElement;
  const fitScreen = () => {
    root.style.setProperty('--app-standalone-gap', '0px');
    const landscape = window.matchMedia('(orientation: landscape)').matches;
    const screenHeight = landscape ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
    const gap = screenHeight - Math.min(window.innerHeight, root.clientHeight);
    root.style.setProperty('--app-standalone-gap', `${gap > 0 && gap < 100 ? gap : 0}px`);
  };
  fitScreen();
  // Размеры окна после поворота обновляются не сразу
  window.matchMedia('(orientation: landscape)').addEventListener?.('change', () => setTimeout(fitScreen, 300));
}

const LEGACY_SESSION_KEY = 'azbuka-session';
const listeners = new Set();
const sessionChannel = !isTelegram && typeof BroadcastChannel === 'function' ? new BroadcastChannel('azbuka-session') : null;

export function legacySessionToken() {
  try {
    const token = JSON.parse(localStorage.getItem(LEGACY_SESSION_KEY))?.token;
    return typeof token === 'string' ? token : null;
  } catch { return null; }
}

export function clearLegacySession() {
  try { localStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* Хранилище может быть недоступно. */ }
}

let session = null;

export const getSession = () => session;

export function saveSession(next, { announce = true } = {}) {
  session = { user: next.user };
  listeners.forEach(listener => listener(session));
  if (announce) sessionChannel?.postMessage('changed');
}

export function clearSession({ announce = true } = {}) {
  if (!session) return;
  session = null;
  listeners.forEach(listener => listener(null));
  if (announce) sessionChannel?.postMessage('changed');
}

export function onSessionChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function onSessionChangeInAnotherTab(listener) {
  sessionChannel?.addEventListener('message', listener);
  return () => sessionChannel?.removeEventListener('message', listener);
}

export const isSignedIn = () => isTelegram || Boolean(session);
export function apiHeaders() {
  if (isTelegram) return { Authorization: `Bearer ${WebApp.initData}` };
  const headers = { 'X-ABC-CSRF': '1' };
  if (session) headers['X-ABC-Account'] = String(session.user.id);
  return headers;
}
// Пользователь Telegram: имя, ник и фото для шапки профиля, id — для черновиков записей
export const currentUser = () => (isTelegram ? WebApp.initDataUnsafe?.user : session?.user) || null;

// Ссылка в новой вкладке. Если браузер заблокировал окно (открываем после запроса к серверу) — в этой же вкладке
export function openExternal(url) {
  const opened = window.open(url, '_blank');
  if (opened) opened.opener = null;
  else window.location.assign(url);
}

// Без Telegram у SDK нет всплывающих окон (showAlert бросает исключение) и ссылки он открывает в этой же вкладке:
// подменяем их на окна в стиле приложения и новые вкладки
if (!isTelegram) {
  WebApp.showPopup = (params, callback) => { showBrowserDialog(params).then(id => callback?.(id)); };
  WebApp.showAlert = (message, callback) => { showBrowserDialog({ message }).then(() => callback?.()); };
  WebApp.showConfirm = (message, callback) => {
    showBrowserDialog({ message, buttons: [{ id: 'cancel', type: 'cancel' }, { id: 'ok', type: 'ok' }] })
      .then(id => callback?.(id === 'ok'));
  };
  WebApp.openLink = url => openExternal(url);
  WebApp.openTelegramLink = url => openExternal(url);
}

// Android и Chrome на компьютере предлагают установку сами: событие ловим сразу, кнопка покажет его позже
let installPrompt = null;
const installListeners = new Set();
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  installListeners.forEach(listener => listener());
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  installListeners.forEach(listener => listener());
});

export const getInstallPrompt = () => installPrompt;
export function onInstallPromptChange(listener) {
  installListeners.add(listener);
  return () => installListeners.delete(listener);
}

// Возвращает true, если пользователь согласился установить
export async function promptInstall() {
  if (!installPrompt) return false;
  const prompt = installPrompt;
  installPrompt = null;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  installListeners.forEach(listener => listener());
  return outcome === 'accepted';
}
