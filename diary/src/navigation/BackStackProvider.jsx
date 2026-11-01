import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackStackContext } from './backStack';
import { isTelegram } from '../utils/platform';

const WebApp = window.Telegram.WebApp;

// Открытые страницы и окна лежат стопкой: системная кнопка «Назад» Telegram закрывает верхнее,
// а пока стопка не пуста, нижнее меню спрятано
export default function BackStackProvider({ children }) {
  const stackRef = useRef([]);
  const [depth, setDepth] = useState(0);

  const push = useCallback((entry) => {
    stackRef.current = [...stackRef.current, entry];
    setDepth(stackRef.current.length);
    return () => {
      stackRef.current = stackRef.current.filter(e => e !== entry);
      setDepth(stackRef.current.length);
    };
  }, []);

  useEffect(() => {
    if (!isTelegram) return;
    const back = WebApp.BackButton;
    if (!back) return;
    const onBack = () => stackRef.current.at(-1)?.onBack.current?.();
    back.onClick(onBack);
    return () => back.offClick(onBack);
  }, []);

  useEffect(() => {
    if (!isTelegram) return;
    const back = WebApp.BackButton;
    if (!back) return;
    if (depth > 0) back.show();
    else back.hide();
  }, [depth]);

  useBrowserHistory(stackRef, depth);

  // Закрыть верхний экран: кнопка «Назад» в шапке браузера (components/TelegramChrome.jsx)
  const back = useCallback(() => stackRef.current.at(-1)?.onBack.current?.(), []);
  const value = useMemo(() => ({ push, depth, back }), [push, depth, back]);
  return <BackStackContext.Provider value={value}>{children}</BackStackContext.Provider>;
}

// В браузере кнопки Telegram нет: каждой открытой странице соответствует запись в истории,
// поэтому «Назад» браузера, жест и системная кнопка Android закрывают верхний экран, а не уходят с сайта
function useBrowserHistory(stackRef, depth) {
  const pushed = useRef(0); // сколько наших записей сейчас в истории
  const skipPops = useRef(0); // popstate от собственных history.go — их не обрабатываем

  const sync = useCallback(() => {
    const target = stackRef.current.length;
    if (target > pushed.current) {
      for (; pushed.current < target; pushed.current += 1) window.history.pushState({ azbukaDepth: pushed.current + 1 }, '');
    } else if (target < pushed.current) {
      // Экран закрыли кнопкой в приложении: убираем его записи из истории
      skipPops.current += 1;
      window.history.go(target - pushed.current);
      pushed.current = target;
    }
  }, [stackRef]);

  useEffect(() => {
    if (!isTelegram) sync();
  }, [depth, sync]);

  useEffect(() => {
    if (isTelegram) return;
    const onPop = () => {
      if (skipPops.current > 0) { skipPops.current -= 1; return; }
      pushed.current = Math.max(0, pushed.current - 1);
      stackRef.current.at(-1)?.onBack.current?.();
      // Экран мог не закрыться (например, спросил подтверждение) — возвращаем запись
      setTimeout(sync, 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [stackRef, sync]);
}
