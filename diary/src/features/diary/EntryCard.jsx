import { useState, useEffect } from 'react';
import { Trash2, Activity, PenLine, Leaf } from 'lucide-react';
import { scoreColor } from './utils';
import ResultContent from '../../components/ResultContent';

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
      <div className="h-1.5 flex-1 bg-rose-950 rounded-full overflow-hidden relative">
        <div className={`absolute inset-y-0 left-0 ${scoreColor(score)}`} style={{ width: `${shown}%` }} />
      </div>
      <span className="text-sm font-bold text-[#F5E6D3] min-w-[4ch] text-right">{Math.round(shown)}%</span>
    </div>
  );
}

// Ответ дневника — отдельный голос: своя подложка и подпись, а не еще одно поле анкеты
function Reply({ text }) {
  return (
    <div className="diary-reply">
      <p className="diary-reply__head"><Leaf size={16} className="text-[#7BA887]" aria-hidden="true" /> Ответ дневника</p>
      <ResultContent content={text} contents={false} compact variant="reply" />
    </div>
  );
}

// analysis: pending | done | ask | idle | locked (см. analysisState)
export default function EntryCard({ entry, analysis, onDelete, onRetry, onEdit }) {
  const score = entry.portrait_match_score;

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

      {analysis === 'pending' && (
        <div className="mt-4 flex items-center gap-2 text-sm text-[#F5E6D3]/80">
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

      {analysis === 'idle' && (
        <button
          onClick={onRetry}
          className="ui-button ui-button--secondary mt-4"
        >
          <Activity size={16} /> Получить ответ дневника
        </button>
      )}
    </article>
  );
}
