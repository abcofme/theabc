import { lazy, Suspense } from 'react';
import ScreenState from './ScreenState';

// Редкие экраны (тест, отчет, оплата, админка) — отдельные файлы: при запуске грузится меньше.
// Пока файл загружается при открытии, поверх приложения показывается экран загрузки.
export function lazyScreen(load) {
  const Screen = lazy(load);
  return function LazyScreen(props) {
    return (
      <Suspense fallback={<div className="app-overlay fixed inset-0 z-[60] bg-rose-950 flex flex-col justify-center"><ScreenState loading /></div>}>
        <Screen {...props} />
      </Suspense>
    );
  };
}
