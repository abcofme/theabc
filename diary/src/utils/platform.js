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

const SESSION_KEY = 'azbuka-session';
const listeners = new Set();

function readStoredSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY));
    return session?.token ? session : null;
  } catch { return null; }
}

let session = isTelegram ? null : readStoredSession();

export const getSession = () => session;

// { token, user: { id, first_name, username, photo_url } } из /api/auth/login/check или /api/auth/handoff/claim
export function saveSession(next) {
  session = { token: next.token, user: next.user };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* приватный режим: сессия до закрытия вкладки */ }
  listeners.forEach(listener => listener(session));
}

export function clearSession() {
  if (!session) return;
  session = null;
  try { localStorage.removeItem(SESSION_KEY); } catch { /* нечего удалять */ }
  listeners.forEach(listener => listener(null));
}

export function onSessionChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const isSignedIn = () => isTelegram || Boolean(session);
export const authHeader = () => (isTelegram ? `Bearer ${WebApp.initData}` : `Session ${session?.token || ''}`);
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
