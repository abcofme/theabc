import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { useBackHandler } from '../navigation/backStack';

// Отдельная страница поверх вкладок: заголовок со стрелкой назад, своя прокрутка, без нижнего меню
export default function Page({ title, onBack, children }) {
  useBackHandler(true, onBack);

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-rose-950 flex flex-col" role="dialog" aria-modal="true" aria-label={title}>
      <header className="page-header">
        <button type="button" onClick={onBack} aria-label="Назад" className="ui-icon-button shrink-0">
          <ChevronLeft size={24} />
        </button>
        <h2 className="text-xl leading-7 font-bold text-[#F5E6D3] min-w-0 break-words">{title}</h2>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="w-full max-w-2xl mx-auto px-4 pb-10 pt-2">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
