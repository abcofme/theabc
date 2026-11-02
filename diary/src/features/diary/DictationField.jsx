import { useState } from 'react';
import { LoaderCircle, Lock, Mic, X } from '../../components/ClayIcon';
import Modal from '../../components/Modal';
import { useAppNav } from '../../navigation/appNav';
import { MAX_SECONDS } from './useDictation';

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
// За полминуты до конца записи вместо прошедшего времени показываем оставшееся
const WARN_SECONDS = 30;

// Панель внизу поля ввода: «Надиктовать» → идет запись → «Распознаю…»
function DictationBar({ dictation, disabled, onLocked }) {
  const { access, state, seconds, meterRef, start, stop, cancel } = dictation;
  const left = MAX_SECONDS - seconds;
  return (
    <div className="dictation-bar">
      {state === 'recording' && (
        <>
          <button type="button" onClick={cancel} aria-label="Отменить диктовку" className="ui-icon-button dictation-bar__cancel"><X size={18} /></button>
          <span className="dictation-bar__status" role="status">
            <span className="dictation-bar__dot" aria-hidden="true" />
            {left <= WARN_SECONDS ? `осталось ${clock(Math.max(left, 0))}` : clock(seconds)}
          </span>
          <button type="button" ref={meterRef} onClick={stop} className="dictation-button dictation-button--recording">
            <span className="dictation-button__stop" aria-hidden="true" />Готово
          </button>
        </>
      )}
      {state === 'processing' && (
        <span className="dictation-bar__status" role="status"><LoaderCircle size={18} className="animate-spin" />Распознаю…</span>
      )}
      {(state === 'idle' || state === 'starting') && (
        <button
          type="button"
          onClick={access === 'locked' ? onLocked : start}
          disabled={disabled || state === 'starting'}
          className="dictation-button"
          aria-label={access === 'locked' ? 'Надиктовать — доступно с Premium' : undefined}
        >
          <Mic size={20} />Надиктовать{access === 'locked' && <Lock size={14} className="dictation-button__lock" />}
        </button>
      )}
    </div>
  );
}

// Пробная диктовка потрачена: что дает Premium, без цен (они только на странице «Подписка и баланс»)
function PremiumOffer({ onClose }) {
  const { openBilling } = useAppNav();
  return (
    <Modal
      title="Диктовка — с Premium"
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={() => { onClose(); openBilling(); }} className="ui-button ui-button--primary">Подробнее о Premium</button>
          <button type="button" onClick={onClose} className="ui-button ui-button--quiet">Не сейчас</button>
        </>
      )}
    >
      <p className="ui-secondary">
        Пробная диктовка уже была. С Premium любую запись можно надиктовать голосом: речь превратится в текст
        с пунктуацией, а запись останется только у тебя в дневнике.
      </p>
    </Modal>
  );
}

// Поле ввода с панелью диктовки. Где записывать нельзя (нет микрофона в WebView), остается обычное поле
export default function DictationField({ dictation, disabled, children }) {
  const [offerOpen, setOfferOpen] = useState(false);
  if (!dictation.supported) return children;
  const { access, state, error } = dictation;
  return (
    <>
      <div className="dictation-field">
        {children}
        <DictationBar dictation={dictation} disabled={disabled} onLocked={() => setOfferOpen(true)} />
      </div>
      {error && <p className="ui-secondary" role="alert">{error}</p>}
      {!error && access === 'trial' && state === 'idle' && (
        <p className="dictation-hint"><Mic size={16} />Попробуй диктовку — одну запись можно надиктовать голосом без Premium</p>
      )}
      {offerOpen && <PremiumOffer onClose={() => setOfferOpen(false)} />}
    </>
  );
}
