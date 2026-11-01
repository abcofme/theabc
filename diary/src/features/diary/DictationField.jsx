import { LoaderCircle, Mic, X } from '../../components/ClayIcon';

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Панель внизу поля ввода: «Надиктовать» → идет запись → «Распознаю…»
function DictationBar({ dictation, disabled }) {
  const { state, seconds, meterRef, start, stop, cancel } = dictation;
  return (
    <div className="dictation-bar">
      {state === 'recording' && (
        <>
          <button type="button" onClick={cancel} aria-label="Отменить диктовку" className="ui-icon-button dictation-bar__cancel"><X size={18} /></button>
          <span className="dictation-bar__status" role="status"><span className="dictation-bar__dot" aria-hidden="true" />{clock(seconds)}</span>
          <button type="button" ref={meterRef} onClick={stop} className="dictation-button dictation-button--recording">
            <span className="dictation-button__stop" aria-hidden="true" />Готово
          </button>
        </>
      )}
      {state === 'processing' && (
        <span className="dictation-bar__status" role="status"><LoaderCircle size={18} className="animate-spin" />Распознаю…</span>
      )}
      {(state === 'idle' || state === 'starting') && (
        <button type="button" onClick={start} disabled={disabled || state === 'starting'} className="dictation-button">
          <Mic size={20} />Надиктовать
        </button>
      )}
    </div>
  );
}

// Поле ввода с панелью диктовки. Где записывать нельзя (нет микрофона в WebView), остается обычное поле
export default function DictationField({ dictation, disabled, children }) {
  if (!dictation.supported) return children;
  return (
    <>
      <div className="dictation-field">
        {children}
        <DictationBar dictation={dictation} disabled={disabled} />
      </div>
      {dictation.error && <p className="ui-secondary" role="alert">{dictation.error}</p>}
    </>
  );
}
