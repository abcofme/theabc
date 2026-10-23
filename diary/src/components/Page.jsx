import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { useBackHandler } from '../navigation/backStack';

// Отдельная страница поверх вкладок: заголовок со стрелкой назад, своя прокрутка, без нижнего меню
export default function Page({ title, onBack, children }) {
  useBackHandler(true, onBack);

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-rose-950 flex flex-col">
      <header className="shrink-0 w-full max-w-2xl mx-auto flex items-center gap-1 px-2 pt-3 pb-2">
        <button onClick={onBack} aria-label="Назад" className="p-2 rounded-xl text-[#F5E6D3] active:scale-95 shrink-0">
          <ChevronLeft size={26} />
        </button>
        <h2 className="text-xl font-bold text-[#F5E6D3] truncate">{title}</h2>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-2xl mx-auto px-4 pb-10 pt-2">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
