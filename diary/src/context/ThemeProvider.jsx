import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ThemeContext } from './theme';
import { readTheme, saveTheme, syncTelegramTheme } from '../utils/theme';

export default function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return readTheme(window.localStorage); }
    catch { return 'dark'; }
  });
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { saveTheme(window.localStorage, theme); } catch { /* Хранилище может быть заблокировано. */ }
    syncTelegramTheme(window.Telegram?.WebApp, theme);
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme(current => current === 'dark' ? 'light' : 'dark'), []);
  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
