// Окно вместо всплывающих окон Telegram (showAlert, showConfirm, showPopup) вне Telegram.
// Параметры как у WebApp.showPopup: { title, message, buttons: [{ id, type, text }] }. Промис отдаёт id нажатой кнопки,
// а при закрытии без выбора — пустую строку. Окна идут по очереди, как в Telegram
const DEFAULT_TEXT = { ok: 'OK', close: 'Закрыть', cancel: 'Отмена' };
let queue = Promise.resolve();

export function showBrowserDialog(params) {
  const result = queue.then(() => openDialog(params));
  queue = result.catch(() => {});
  return result;
}

function openDialog({ title, message, buttons = [{ id: '', type: 'close' }] }) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'app-overlay app-overlay--modal fixed inset-0 z-[200] flex items-center justify-center bg-rose-950/80 backdrop-blur-sm';

    const dialog = document.createElement('div');
    dialog.className = 'ui-dialog relative bg-rose-900 rounded-[2rem] w-full max-w-sm p-5 flex flex-col gap-5';
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');

    if (title) {
      const heading = document.createElement('h3');
      heading.className = 'text-lg font-bold text-[var(--ui-text)] leading-snug';
      heading.textContent = title;
      dialog.append(heading);
    }
    const text = document.createElement('p');
    text.className = 'text-base leading-6 text-[var(--ui-text)] whitespace-pre-line break-words';
    text.textContent = message;
    text.id = `browser-dialog-${Date.now()}`;
    dialog.setAttribute('aria-describedby', text.id);
    dialog.append(text);

    const actions = document.createElement('div');
    actions.className = 'flex gap-3';
    const close = (id) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      previousFocus?.focus?.({ preventScroll: true });
      resolve(id);
    };
    // Отмена — слева и спокойная, основное действие — справа
    const cancelId = buttons.find(b => b.type === 'cancel' || b.type === 'close')?.id ?? '';
    const elements = buttons.map((button) => {
      const element = document.createElement('button');
      element.type = 'button';
      const quiet = button.type === 'cancel' || (button.type === 'close' && buttons.length > 1);
      element.className = `ui-button ${quiet ? 'ui-button--secondary' : 'ui-button--primary'} flex-1`;
      element.textContent = button.text || DEFAULT_TEXT[button.type] || 'OK';
      element.addEventListener('click', () => close(button.id ?? ''));
      actions.append(element);
      return element;
    });
    dialog.append(actions);
    overlay.append(dialog);

    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(cancelId); }
      if (event.key === 'Tab') {
        // Фокус не уходит из окна
        const first = elements[0];
        const last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    elements.at(-1)?.focus({ preventScroll: true });
  });
}
