import { useState, useEffect, useLayoutEffect, useRef, useId } from 'react';
import { ChevronLeft } from 'lucide-react';
import { readDraft, saveDraft, clearDraft } from './drafts';

const WebApp = window.Telegram.WebApp;

// Запись в два шага. Черновик принадлежит пользователю и дате/редактируемой записи.
export default function EntryForm({ title, initial, draftKey, submitLabel = 'Сохранить', onSubmit, onCancel }) {
  const owner = WebApp.initDataUnsafe?.user?.id || 'current';
  const [draft] = useState(() => readDraft(owner, draftKey, initial));
  const [step, setStep] = useState(draft.step);
  const [event, setEvent] = useState(draft.event);
  const [reaction, setReaction] = useState(draft.reaction);
  const [draftSaved, setDraftSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fieldRef = useRef(null);
  const submittingRef = useRef(false);
  const fieldId = useId();
  const value = step === 'event' ? event : reaction;

  const persist = (changes = {}) => setDraftSaved(saveDraft(owner, draftKey, { event, reaction, step, ...changes }));
  const changeStep = next => { persist({ step: next }); setStep(next); };


  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(Math.max(field.scrollHeight, 120), 320)}px`;
  }, [value, step]);

  useEffect(() => {
    const field = fieldRef.current;
    if (step !== 'reaction' || !field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, [step]);

  const cancel = () => {
    saveDraft(owner, draftKey, { event, reaction, step });
    onCancel();
  };

  const handleSubmit = async () => {
    if (submittingRef.current || !event.trim() || !reaction.trim()) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onSubmit(event.trim(), reaction.trim());
      clearDraft(owner, draftKey);
      setEvent('');
      setReaction('');
      setStep('event');
      WebApp.HapticFeedback?.notificationOccurred('success');
    } catch (err) {
      WebApp.showAlert(err.message || 'Не удалось сохранить запись. Попробуйте ещё раз.');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="ui-muted">{step === 'event' ? 'Событие · шаг 1 из 2' : 'Реакция · шаг 2 из 2'}</p>
      {step === 'reaction' && (
        <button type="button" onClick={() => changeStep('event')} disabled={isSubmitting} className="flex gap-2 text-left ui-secondary py-2">
          <ChevronLeft size={20} className="shrink-0" />
          <span><span className="line-clamp-3">{event}</span><span className="block underline underline-offset-4 mt-1">Изменить событие</span></span>
        </button>
      )}
      <label htmlFor={fieldId} className="text-lg leading-6 font-semibold">
        {step === 'event' ? title || 'Что произошло?' : 'Как ты отреагировал(а)?'}
      </label>
      <textarea
        key={step}
        id={fieldId}
        ref={fieldRef}
        rows={4}
        value={value}
        disabled={isSubmitting}
        onChange={(e) => {
          if (step === 'event') { setEvent(e.target.value); persist({ event: e.target.value }); }
          else { setReaction(e.target.value); persist({ reaction: e.target.value }); }
        }}
        placeholder={step === 'event' ? 'Например: начальник отчитал меня при всех' : 'Что ты сделал(а), что почувствовал(а)…'}
        className="ui-input resize-none"
      />
      <div className="flex gap-3">
        {onCancel && <button type="button" onClick={cancel} disabled={isSubmitting} className="ui-button ui-button--outline w-auto!">Позже</button>}
        <button type="button" disabled={!value.trim() || isSubmitting} onClick={step === 'event' ? () => changeStep('reaction') : handleSubmit} className="ui-button ui-button--primary flex-1">
          {step === 'event' ? 'Дальше' : isSubmitting ? 'Сохраняю…' : submitLabel}
        </button>
      </div>
      {draftKey && draftSaved && (event || reaction) && <p className="ui-muted">Черновик сохранен на этом устройстве</p>}
    </div>
  );
}
