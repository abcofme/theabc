import { createPortal } from 'react-dom';
import { X } from './ClayIcon';
import { useBackHandler } from '../navigation/backStack';

// Окно по центру экрана. Закрывается крестиком, тапом мимо окна и кнопкой «Назад» Telegram
export default function Modal({ title, onClose, children, footer }) {
  useBackHandler(true, onClose);

  return createPortal(
    <div className="app-overlay app-overlay--modal fixed inset-0 z-[70] flex items-center justify-center p-4 bg-rose-950/80 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative bg-rose-900 rounded-[2rem] w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <h3 className="text-lg font-bold text-[var(--ui-text)] leading-snug">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="ui-icon-button -m-1 shrink-0">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 pb-5 overflow-y-auto min-h-0">{children}</div>
        {footer && <div className="p-5 border-t border-[var(--ui-text)]/10 rounded-b-[2rem] flex flex-col gap-3 shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
