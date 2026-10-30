import { useState, useEffect, useLayoutEffect, useRef, useId } from 'react';
import { Trash2, Activity, PenLine, Leaf, Plus } from '../../components/ClayIcon';
import { scoreColor } from './utils';
import { readTextDraft, saveTextDraft } from './drafts';
import ResultContent from '../../components/ResultContent';

const WebApp = window.Telegram.WebApp;

const Label = ({ children }) => (
  <span className="entry-label">{children}</span>
);

// Шкала соответствия портрету: заполняется один раз при появлении
function MatchScale({ score }) {
  const [shown, setShown] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? score : 0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame;
    let start = null;
    const duration = 1500;
    const step = (timestamp) => {
      if (start === null) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const easeOut = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setShown(score * easeOut);
      if (progress < 1) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [score]);

  return (
    <div className="flex items-center gap-3">
      <div className="clay-pressed h-1.5 flex-1 bg-rose-950 rounded-full overflow-hidden relative">
        <div className={`absolute inset-y-0 left-0 ${scoreColor(score)}`} style={{ width: `${shown}%` }} />
      </div>
      <span className="text-sm font-bold text-[var(--ui-text)] min-w-[4ch] text-right">{Math.round(shown)}%</span>
    </div>
  );
}

// Ответ дневника — отдельный голос: своя подложка и подпись, а не еще одно поле анкеты
function Reply({ text }) {
  return (
    <div className="diary-reply">
      <p className="diary-reply__head"><Leaf size={16} className="text-[var(--ui-sage)]" aria-hidden="true" /> Ответ дневника</p>
      <ResultContent content={text} contents={false} compact variant="reply" />
    </div>
  );
}

// Дополнение к сохранённой записи: что вспомнилось позже или о чём спросил дневник
function AdditionForm({ entryId, canAnswer, onSubmit, onClose }) {
  const owner = WebApp.initDataUnsafe?.user?.id || 'current';
  const draftKey = `addition:${entryId}`;
  const [text, setText] = useState(() => readTextDraft(owner, draftKey));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fieldRef = useRef(null);
  const fieldId = useId();

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(Math.max(field.scrollHeight, 120), 320)}px`;
  }, [text]);

  useEffect(() => {
    const field = fieldRef.current;
    field?.focus();
    field?.setSelectionRange(field.value.length, field.value.length);
  }, []);

  const submit = async () => {
    if (isSubmitting || !text.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(text.trim());
      saveTextDraft(owner, draftKey, '');
      WebApp.HapticFeedback?.notificationOccurred('success');
      onClose();
    } catch (err) {
      WebApp.showAlert(err.message || 'Не удалось сохранить дополнение. Попробуйте ещё раз.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-5 flex flex-col gap-3">
      <label htmlFor={fieldId} className="text-lg leading-6 font-semibold">Что хочешь добавить?</label>
      <textarea
        id={fieldId}
        ref={fieldRef}
        rows={4}
        value={text}
        disabled={isSubmitting}
        onChange={(e) => { setText(e.target.value); saveTextDraft(owner, draftKey, e.target.value); }}
        placeholder="Что было дальше, что ещё почувствовал(а) или понял(а)…"
        className="ui-input resize-none"
      />
      {canAnswer && <p className="ui-muted">Дневник перечитает запись вместе с дополнением и ответит заново</p>}
      <div className="flex gap-3">
        <button type="button" onClick={onClose} disabled={isSubmitting} className="ui-button ui-button--outline w-auto!">Позже</button>
        <button type="button" onClick={submit} disabled={!text.trim() || isSubmitting} className="ui-button ui-button--primary flex-1">
          {isSubmitting ? 'Сохраняю…' : canAnswer ? 'Отправить дневнику' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}

// analysis: pending | done | ask | idle | locked (см. analysisState)
export default function EntryCard({ entry, analysis, onDelete, onRetry, onEdit, onAddition }) {
  const score = entry.portrait_match_score;
  const [adding, setAdding] = useState(false);
  // В «ask» запись переписывают целиком через «Дописать», пока идёт разбор — ждём его
  const canAdd = onAddition && ['done', 'idle', 'locked'].includes(analysis);

  return (
    <article id={`diary-entry-${entry.id}`} className="ui-card diary-entry relative">
      <button
        onClick={onDelete}
        aria-label="Удалить запись"
        className="ui-icon-button absolute top-2 right-2"
      >
        <Trash2 size={16} />
      </button>
      <div className="mb-4 pr-8">
        <Label>Событие</Label>
        <div className="entry-event"><ResultContent content={entry.event} contents={false} compact variant="entry" /></div>
      </div>
      <div>
        <Label>Реакция</Label>
        <ResultContent content={entry.reaction} contents={false} compact variant="entry" />
      </div>
      {entry.addition && (
        <div className="mt-4">
          <Label>Дополнение</Label>
          <ResultContent content={entry.addition} contents={false} compact variant="entry" />
        </div>
      )}

      {analysis === 'pending' && (
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--ui-secondary)]">
          <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
          Дневник читает запись…
        </div>
      )}

      {analysis === 'done' && (
        <div className="mt-5">
          <Label>Насколько это похоже на тебя</Label>
          <MatchScale score={score} />
          {entry.portrait_match_explanation && <Reply text={entry.portrait_match_explanation} />}
        </div>
      )}

      {/* Дневник не стал делать разбор: попросил дописать запись или дал кризисный ответ — шкалу не показываем */}
      {analysis === 'ask' && (
        <>
          <Reply text={entry.portrait_match_explanation} />
          <button
            onClick={onEdit}
            className="ui-button ui-button--secondary mt-4"
          >
            <PenLine size={16} /> Дописать
          </button>
        </>
      )}

      {analysis === 'idle' && !adding && (
        <button
          onClick={onRetry}
          className="ui-button ui-button--secondary mt-4"
        >
          <Activity size={16} /> Получить ответ дневника
        </button>
      )}

      {canAdd && (adding ? (
        <AdditionForm
          entryId={entry.id}
          canAnswer={analysis !== 'locked'}
          onSubmit={onAddition}
          onClose={() => setAdding(false)}
        />
      ) : (
        <button onClick={() => setAdding(true)} className="ui-button ui-button--quiet mt-2">
          <Plus size={16} /> Дополнить запись
        </button>
      ))}
    </article>
  );
}
