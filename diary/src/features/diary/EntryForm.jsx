import { useState, useEffect, useRef } from 'react';
import { ChevronLeft } from 'lucide-react';

const WebApp = window.Telegram.WebApp;

const fieldClass = "w-full bg-rose-950 rounded-xl px-4 py-3 text-[#F5E6D3] placeholder:text-[#F5E6D3]/40 focus:outline-none focus:ring-2 focus:ring-emerald-700 resize-none";
const primaryClass = "flex-1 bg-emerald-800 disabled:bg-emerald-950/40 disabled:text-[#F5E6D3]/50 text-[#F5E6D3] font-bold py-3 rounded-xl active:scale-[0.98]";
const secondaryClass = "px-4 bg-rose-800 text-[#F5E6D3] font-bold py-3 rounded-xl active:scale-[0.98]";

// Запись в два шага: сначала событие, потом реакция — так проще начать и это похоже на разговор
export default function EntryForm({ title, initial, submitLabel = 'Сохранить', onSubmit, onCancel }) {
  const [step, setStep] = useState('event');
  const [event, setEvent] = useState(initial?.event || '');
  const [reaction, setReaction] = useState(initial?.reaction || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const reactionRef = useRef(null);

  // На шаге реакции курсор — в конец текста, чтобы при «Дописать» продолжать, а не вставлять в начало
  useEffect(() => {
    const field = reactionRef.current;
    if (step !== 'reaction' || !field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, [step]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(event.trim(), reaction.trim());
      setEvent('');
      setReaction('');
      setStep('event');
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch (err) {
      WebApp.showAlert(err.message || 'Не удалось сохранить запись. Попробуйте ещё раз.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === 'event') {
    return (
      <div className="flex flex-col gap-3">
        {title && <h3 className="text-lg font-bold text-[#F5E6D3]">{title}</h3>}
        <textarea
          rows="3"
          value={event}
          onChange={(e) => setEvent(e.target.value)}
          placeholder="Например: начальник отчитал меня при всех"
          className={fieldClass}
        />
        <div className="flex gap-2">
          {onCancel && <button type="button" onClick={onCancel} className={secondaryClass}>Отмена</button>}
          <button type="button" disabled={!event.trim()} onClick={() => setStep('reaction')} className={primaryClass}>
            Дальше
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setStep('event')}
        className="flex items-start gap-1.5 text-left text-sm text-[#F5E6D3]/70"
      >
        <ChevronLeft size={16} className="shrink-0 mt-0.5" />
        <span className="line-clamp-2">{event}</span>
      </button>
      <h3 className="text-lg font-bold text-[#F5E6D3]">Как ты отреагировал(а)?</h3>
      <textarea
        rows="3"
        ref={reactionRef}
        value={reaction}
        onChange={(e) => setReaction(e.target.value)}
        placeholder="Что ты сделал(а), что почувствовал(а)…"
        className={fieldClass}
      />
      <div className="flex gap-2">
        {onCancel && <button type="button" onClick={onCancel} className={secondaryClass}>Отмена</button>}
        <button type="button" disabled={!reaction.trim() || isSubmitting} onClick={handleSubmit} className={primaryClass}>
          {isSubmitting ? 'Сохраняю…' : submitLabel}
        </button>
      </div>
    </div>
  );
}
