export const THEME_STORAGE_KEY = 'azbuka-theme';

export function readTheme(storage) {
  try { return storage?.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
}

export function saveTheme(storage, theme) {
  try { storage?.setItem(THEME_STORAGE_KEY, theme); }
  catch { /* Выбор работает и при недоступном хранилище. */ }
}

export function syncTelegramTheme(webApp, theme) {
  const background = theme === 'light' ? '#E6D0AD' : '#3B1819';
  const bar = theme === 'light' ? '#F0DEC0' : '#582626';
  for (const [method, color] of [['setBackgroundColor', background], ['setHeaderColor', background], ['setBottomBarColor', bar]]) {
    try { webApp?.[method]?.(color); }
    catch { /* Старые клиенты Telegram могут не поддерживать один из методов. */ }
  }
}
