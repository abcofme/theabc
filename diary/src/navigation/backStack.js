import { createContext, useContext, useEffect, useRef } from 'react';

export const BackStackContext = createContext({ push: () => () => {}, depth: 0 });

// Сколько страниц и окон открыто поверх вкладок
export const useBackDepth = () => useContext(BackStackContext).depth;

// Пока active, onBack закрывает этот экран по кнопке «Назад» Telegram
export function useBackHandler(active, onBack) {
  const { push } = useContext(BackStackContext);
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  });
  useEffect(() => {
    if (!active) return;
    return push({ onBack: onBackRef });
  }, [active, push]);
}
