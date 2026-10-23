import { createContext, useCallback, useContext } from 'react';

const WebApp = window.Telegram.WebApp;

// navigate({ tab, page, report }) — открыть вкладку и экран на ней; openBilling — страница подписки и баланса
export const AppNavContext = createContext({ navigate: () => {}, openBilling: () => {} });

export const useAppNav = () => useContext(AppNavContext);

// Не хватило баланса (402) — ведём на страницу подписки и баланса. Иначе показываем message,
// а без него — текст ошибки от бэкенда
export function useErrorHandler() {
  const { openBilling } = useAppNav();
  return useCallback((err, message) => {
    if (err?.status === 402) openBilling();
    else WebApp.showAlert(message || err?.message || 'Что-то пошло не так. Попробуйте ещё раз.');
  }, [openBilling]);
}
