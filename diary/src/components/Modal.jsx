import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useBackHandler } from '../navigation/backStack';

// Окно по центру экрана. Закрывается крестиком, тапом мимо окна и кнопкой «Назад» Telegram
export default function Modal({ title, onClose, children, footer }) {
  useBackHandler(true, onClose);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-rose-950/80 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative bg-rose-900 rounded-[2rem] w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <h3 className="text-lg font-bold text-[#F5E6D3] leading-snug">{title}</h3>
          <button onClick={onClose} aria-label="Закрыть" className="p-2 -m-1 rounded-full bg-rose-950/50 text-[#F5E6D3]/70 hover:text-[#F5E6D3] shrink-0">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 pb-5 overflow-y-auto">{children}</div>
        {footer && <div className="p-4 sm:p-5 bg-rose-950/50 rounded-b-[2rem] flex flex-col gap-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
