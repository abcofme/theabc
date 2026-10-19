import { useState, useEffect } from 'react';
import { Trash2, Activity, PenLine } from 'lucide-react';
import { scoreColor } from './utils';

const Label = ({ children }) => (
  <span className="text-xs font-bold text-[#F5E6D3]/70 uppercase tracking-wider block mb-1">{children}</span>
);

// Шкала соответствия портрету: заполняется один раз при появлении
function MatchScale({ score }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
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
      <div className="h-2 flex-1 bg-rose-800 rounded-full overflow-hidden relative">
        <div className={`absolute inset-y-0 left-0 ${scoreColor(score)}`} style={{ width: `${shown}%` }} />
      </div>
      <span className="text-sm font-bold text-[#F5E6D3] min-w-[4ch] text-right">{Math.round(shown)}%</span>
    </div>
  );
}

function Reply({ text, accentClass }) {
  return (
    <div className="mt-3 p-3 bg-rose-900/70 rounded-xl relative">
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl ${accentClass}`} />
      <p className="text-xs font-bold text-[#F5E6D3]/70 uppercase tracking-wider mb-1 pl-2">Ответ дневника</p>
      <p className="text-sm text-[#F5E6D3]/90 leading-relaxed pl-2 whitespace-pre-wrap">{text}</p>
    </div>
  );
}

// analysis: pending | done | ask | idle | locked (см. analysisState)
export default function EntryCard({ entry, analysis, onDelete, onRetry, onEdit }) {
  const score = entry.portrait_match_score;

  return (
    <div className="bg-rose-950/50 rounded-2xl p-4 relative">
      <button
        onClick={onDelete}
        aria-label="Удалить запись"
        className="absolute top-2 right-2 p-2 text-[#F5E6D3]/50 hover:text-[#F5E6D3] rounded-xl active:scale-95"
      >
        <Trash2 size={16} />
      </button>
      <div className="mb-3 pr-8">
        <Label>Событие</Label>
        <p className="text-base text-[#F5E6D3] font-medium whitespace-pre-wrap">{entry.event}</p>
      </div>
      <div>
        <Label>Реакция</Label>
        <p className="text-base text-[#F5E6D3] whitespace-pre-wrap">{entry.reaction}</p>
      </div>

      {analysis === 'pending' && (
        <div className="mt-4 flex items-center gap-2 text-sm text-[#F5E6D3]/80">
          <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
          Дневник читает запись…
        </div>
      )}

      {analysis === 'done' && (
        <div className="mt-4">
          <Label>Соответствие портрету личности</Label>
          <MatchScale score={score} />
          {entry.portrait_match_explanation && (
            <Reply text={entry.portrait_match_explanation} accentClass={scoreColor(score)} />
          )}
        </div>
      )}

      {/* Дневник не стал делать разбор: попросил дописать запись или дал кризисный ответ — шкалу не показываем */}
      {analysis === 'ask' && (
        <>
          <Reply text={entry.portrait_match_explanation} accentClass="bg-[#F5E6D3]/40" />
          <button
            onClick={onEdit}
            className="mt-3 w-full py-2.5 bg-rose-800 text-[#F5E6D3] font-bold rounded-xl text-sm flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <PenLine size={16} /> Дописать
          </button>
        </>
      )}

      {analysis === 'idle' && (
        <button
          onClick={onRetry}
          className="mt-4 w-full py-2.5 bg-rose-800 text-[#F5E6D3] font-bold rounded-xl text-sm flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          <Activity size={16} /> Получить ответ дневника
        </button>
      )}
    </div>
  );
}
