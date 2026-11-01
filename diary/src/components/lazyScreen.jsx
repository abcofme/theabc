import { lazy, Suspense, useState } from 'react';
import ScreenState from './ScreenState';

// Редкие экраны (тест, отчет, оплата, админка) — отдельные файлы: при запуске грузится меньше.
// Когда первый экран показан, они подгружаются заранее (preloadScreens), и переход обычно мгновенный.
// Если файл еще в пути — поверх приложения экран загрузки
const loaders = [];

export function lazyScreen(load) {
  let Loaded = null;
  const loadScreen = () => load().then((module) => { Loaded = module.default; return module; });
  loaders.push(loadScreen);
  const Screen = lazy(loadScreen);
  return function LazyScreen(props) {
    // Уже загруженный экран показываем сразу: lazy мигнул бы экраном загрузки даже для готового файла.
    // Выбор делаем один раз, иначе после загрузки экран смонтировался бы заново и потерял состояние
    const [Component] = useState(() => Loaded || Screen);
    return (
      <Suspense fallback={<div className="app-overlay fixed inset-0 z-[60] bg-rose-950 flex flex-col justify-center"><ScreenState loading /></div>}>
        <Component {...props} />
      </Suspense>
    );
  };
}

export function preloadScreens() {
  loaders.forEach(load => load().catch(() => {}));
}
