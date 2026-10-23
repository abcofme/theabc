import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackStackContext } from './backStack';

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
    const back = WebApp.BackButton;
    if (!back) return;
    const onBack = () => stackRef.current.at(-1)?.onBack.current?.();
    back.onClick(onBack);
    return () => back.offClick(onBack);
  }, []);

  useEffect(() => {
    const back = WebApp.BackButton;
    if (!back) return;
    if (depth > 0) back.show();
    else back.hide();
  }, [depth]);

  const value = useMemo(() => ({ push, depth }), [push, depth]);
  return <BackStackContext.Provider value={value}>{children}</BackStackContext.Provider>;
}
