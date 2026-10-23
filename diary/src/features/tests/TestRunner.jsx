import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ArrowLeft, ArrowRight, Undo2, Wand2 } from 'lucide-react';
import Spinner from '../../components/Spinner';
import ClayBanner from '../../components/ClayBanner';
import ScreenState from '../../components/ScreenState';
import { readTestProgress, saveTestProgress, clearTestProgress, resumeTestProgress } from './testProgress';
import { useBackHandler } from '../../navigation/backStack';
import { useAppNav, useErrorHandler } from '../../navigation/appNav';
import { useProfile, portraitState } from '../../context/profile';
import { api } from '../../utils/api';

const WebApp = window.Telegram.WebApp;

const TUTORIAL_KEY = 'swipe_tutorial_seen';
// Примерно столько уходит на один ответ свайпом
const SECONDS_PER_QUESTION = 5;

function storage(action) {
  try {
    return action(localStorage);
  } catch {
    return null;
  }
}

// Прохождение теста отдельной страницей: старт, карточки-свайпы «да/нет», результат
export default function TestRunner({ test, image, onClose }) {
  const { profile, refreshProfile, generatePortrait, isGeneratingPortrait } = useProfile();
  const { navigate } = useAppNav();
  const handleError = useErrorHandler();
  const [saved] = useState(() => readTestProgress(test.id));
  const [details, setDetails] = useState(null);
  const [index, setIndex] = useState(saved.index);
  const [answers, setAnswers] = useState(saved.answers);
  const [isStarted, setIsStarted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const submissionLock = useRef(false);
  const [result, setResult] = useState(null);
  const [showTutorial, setShowTutorial] = useState(() => !storage(s => s.getItem(TUTORIAL_KEY)));

  // Swipe states
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [swipingOut, setSwipingOut] = useState(null);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    api(`/api/tests/${test.id}`)
      .then(data => {
        setDetails(data);
        // Вопросы могли измениться с прошлого раза: сохранённый прогресс не должен выйти за их число
        const restored = resumeTestProgress(saved, data.questions?.length || 0);
        setIndex(restored.index);
        setAnswers(restored.answers);
        if (restored.pending) { setIsStarted(true); setSubmitError('Ответы сохранены. Повтори отправку результата.'); }
      })
      .catch(err => {
        handleError(err, 'Не удалось загрузить тест');
        onCloseRef.current();
      });
  }, [test.id, handleError, saved]);

  // Прогресс сохраняется, чтобы продолжить с того же вопроса
  useEffect(() => {
    if (isStarted && !isSubmitting && !result) {
      saveTestProgress(test.id, { answers, index, total: details?.questions?.length });
    }
  }, [test.id, index, answers, isStarted, isSubmitting, result, details]);

  // Подсказка про свайпы — только на первом тесте, до первого касания или ответа
  const dismissTutorial = () => {
    if (!showTutorial) return;
    setShowTutorial(false);
    storage(s => s.setItem(TUTORIAL_KEY, '1'));
  };

  const exit = () => onClose();
  useBackHandler(true, exit);

  const submitAnswers = async (submittedAnswers) => {
    if (submissionLock.current) return;
    submissionLock.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const data = await api(`/api/tests/${details.id}/submit`, { method: 'POST', body: { answer_ids: submittedAnswers } });
      setResult(data.result);
      clearTestProgress(test.id);
      WebApp.HapticFeedback?.notificationOccurred('success');
      refreshProfile();
    } catch (err) {
      setSubmitError(err.message || 'Не удалось сохранить результат. Ответы сохранены на устройстве.');
    } finally {
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  };

  const handleAnswerClick = (answerId) => {
    if (submissionLock.current || submitError || result) return;
    WebApp.HapticFeedback?.selectionChanged();
    const newAnswers = [...answers, answerId];
    setAnswers(newAnswers);
    if (index < details.questions.length - 1) { setIndex(previous => previous + 1); return; }
    saveTestProgress(test.id, { answers: newAnswers, index, total: details.questions.length });
    submitAnswers(newAnswers);
  };

  const handleGoBack = () => {
    if (index > 0) {
      WebApp.HapticFeedback?.impactOccurred('light');
      setIndex(prev => prev - 1);
      setAnswers(prev => prev.slice(0, -1));
    }
  };

  const handleTouchStart = (e) => {
    dismissTutorial();
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = startXRef.current;
    setIsDragging(true);
    setSwipingOut(null);
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    currentXRef.current = e.touches[0].clientX;
    setDragOffset(currentXRef.current - startXRef.current);
  };

  const executeSwipe = (direction) => {
    if (swipingOut) return;
    setSwipingOut(direction);
    const isYes = direction === 'right';
    const currentQ = details.questions[index];
    const ans = isYes
      ? currentQ.answers.find(a => a.name.toLowerCase().includes('да') || a.name.toLowerCase() === 'верно') || currentQ.answers[0]
      : currentQ.answers.find(a => a.name.toLowerCase().includes('нет') || a.name.toLowerCase() === 'неверно') || currentQ.answers[1] || currentQ.answers[0];

    setTimeout(() => {
      handleAnswerClick(ans.id);
      setDragOffset(0);
      setSwipingOut(null);
    }, 450);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (dragOffset > 80) executeSwipe('right');
    else if (dragOffset < -80) executeSwipe('left');
    else setDragOffset(0);
  };

  const triggerSwipe = (direction) => {
    if (swipingOut) return;
    dismissTutorial();
    setIsDragging(false);
    setDragOffset(direction === 'right' ? 300 : -300);
    executeSwipe(direction);
  };

  const makePortrait = async () => {
    try {
      await generatePortrait();
      onClose();
      navigate({ tab: 'profile', page: 'portrait' });
    } catch (err) {
      handleError(err);
    }
  };

  const questions = details?.questions || [];
  const minutes = Math.max(1, Math.round((questions.length * SECONDS_PER_QUESTION) / 60));

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-rose-950">


      <header className="relative z-10 shrink-0 w-full max-w-md mx-auto flex items-center gap-2 px-2 pt-3 pb-2">
        <button onClick={exit} aria-label="Назад" className="ui-icon-button shrink-0">
          <ChevronLeft size={24} />
        </button>
        {isStarted && !result && details ? (
          <>
            <span className="text-[#F5E6D3]/70 font-semibold text-sm whitespace-nowrap">Вопрос {index + 1} из {questions.length}</span>
            <div className="flex-1 h-2 bg-rose-900/50 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-800 transition-all duration-500 ease-out" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
            </div>
            <button
              onClick={handleGoBack}
              disabled={index === 0 || isSubmitting || !!submitError}
              aria-label="Предыдущий вопрос"
              className="ui-icon-button disabled:opacity-35 shrink-0"
            >
              <Undo2 size={20} />
            </button>
          </>
        ) : (
          <h2 className="page-title text-[#F5E6D3] truncate">{test.name}</h2>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-8 pt-2 flex flex-col relative z-10">
        {!details ? (
          <Spinner className="flex-1" />
        ) : questions.length === 0 ? (
          <ScreenState title="В этом тесте пока нет вопросов" />
        ) : result ? (
          <div className="flex-1 flex flex-col max-w-md mx-auto w-full">
            <div className="ui-card flex flex-col">
              <p className="text-xs font-bold text-[#F5E6D3]/70 uppercase tracking-wider mb-3">Результат</p>
              <div className="text-base leading-[26px] whitespace-pre-wrap pb-4">{result}</div>
              {portraitState(profile) === 'ready' ? (
                <>
                  <p className="text-sm text-[#F5E6D3]/80 mt-2">Все тесты пройдены — можно сформировать портрет личности.</p>
                  <button onClick={makePortrait} disabled={isGeneratingPortrait} className="ui-button ui-button--primary mt-4">
                    <Wand2 size={20} /> {isGeneratingPortrait ? 'Портрет формируется…' : 'Сформировать портрет'}
                  </button>
                  <button onClick={exit} className="w-full mt-2 py-3 text-[#F5E6D3]/70 font-medium">Позже</button>
                </>
              ) : (
                <button onClick={exit} className="ui-button ui-button--outline mt-4">
                  Вернуться к тестам
                </button>
              )}
            </div>
          </div>
        ) : isSubmitting ? (
          <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#F5E6D3] border-t-transparent"></div>
            <p className="text-[#F5E6D3] font-medium text-lg">Обработка результатов...</p>
          </div>
        ) : submitError ? (
          <div className="ui-card w-full max-w-md mx-auto" role="alert">
            <h3 className="text-lg font-semibold mb-3">Ответы сохранены</h3>
            <p className="ui-secondary mb-5">{submitError}</p>
            <button type="button" onClick={() => submitAnswers(answers)} className="ui-button ui-button--primary">Повторить отправку</button>
          </div>
        ) : !isStarted ? (
          <div className="flex-1 flex flex-col max-w-md mx-auto w-full">
            {/* Обложка категории: тест начинается в том же пластилиновом мире, что и каталог */}
            {image && <ClayBanner id={`test-start-${test.id}`} kind="test" title={test.name} description={details.description} image={image} />}
            <div className="mt-6 px-1">
              {details.description && <p className="text-base leading-[26px] mb-3">{details.description}</p>}
              <p className="ui-secondary">Вопросов: {questions.length} · около {minutes} мин{index > 0 ? ` · отвечено ${index}` : ''}</p>
              <p className="ui-muted mt-3">На каждый вопрос — «да» или «нет»: смахни карточку или нажми кнопку под ней.</p>
            </div>
            <div className="flex-1 min-h-6" />
            <button
              onClick={() => setIsStarted(true)}
              className="ui-button ui-button--primary"
            >
              {index > 0 ? 'Продолжить тест' : 'Пройти тест'}
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col max-w-md mx-auto w-full relative">
            {showTutorial && index === 0 && (
              <p className="flex items-center justify-center gap-2 text-sm text-[#F5E6D3]/70 mb-1">
                <ArrowLeft size={16} /> Нет · смахни карточку · Да <ArrowRight size={16} />
              </p>
            )}
            <div className="relative flex-1 flex flex-col w-full min-h-[340px] mb-4">
              {/* Следующая карточка — под текущей */}
              {index + 1 < questions.length && <div className="absolute inset-x-1 top-0 bottom-4 rounded-3xl bg-rose-800/30" aria-hidden="true" />}

              <div
                key={index}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className={`absolute inset-2 bg-rose-900 rounded-3xl border border-[#F5E6D3]/10 p-6 sm:p-8 flex flex-col items-center justify-center text-center overflow-hidden cursor-grab active:cursor-grabbing select-none
                  ${isDragging ? 'transition-none' : 'transition-all duration-500 ease-out'}
                  ${showTutorial && index === 0 && !isDragging && !swipingOut ? 'animate-swipe-hint' : ''}
                  ${swipingOut === 'right' ? 'translate-x-[150%] rotate-[10deg] opacity-0' : ''}
                  ${swipingOut === 'left' ? '-translate-x-[150%] -rotate-[10deg] opacity-0' : ''}
                `}
                style={(!swipingOut && isDragging) ? { transform: `translateX(${dragOffset}px) rotate(${dragOffset * 0.05}deg)` } : {}}
              >
                {/* Подсветка направления свайпа */}
                <div
                  className="absolute inset-0 bg-[#F5E6D3] transition-opacity duration-200"
                  style={{ opacity: Math.min(Math.abs(dragOffset) / 300, 0.08) }}
                />

                <div className="flex-1 flex flex-col justify-center w-full relative z-10 overflow-y-auto overflow-x-hidden pointer-events-auto px-2">
                  <div className="flex items-center min-h-full">
                    <h4 className="text-[22px] leading-[30px] sm:text-[26px] sm:leading-[34px] font-bold text-[#F5E6D3] mx-auto w-full max-h-full text-balance">
                      {questions[index]?.name || 'Вопрос загружается...'}
                    </h4>
                  </div>
                </div>

                {/* Какой ответ выбирается свайпом — одинаковыми метками, без оценки цветом */}
                <span className="absolute top-6 left-6 bg-[#F5E6D3] text-rose-950 font-bold text-base px-4 py-1.5 rounded-full pointer-events-none transition-opacity duration-200" style={{ opacity: dragOffset > 30 ? Math.min(dragOffset / 100, 1) : 0 }}>
                  Да
                </span>
                <span className="absolute top-6 right-6 bg-[#F5E6D3] text-rose-950 font-bold text-base px-4 py-1.5 rounded-full pointer-events-none transition-opacity duration-200" style={{ opacity: dragOffset < -30 ? Math.min(-dragOffset / 100, 1) : 0 }}>
                  Нет
                </span>
              </div>
            </div>
            {/* Кнопки под карточкой, в зоне большого пальца; ответы выглядят одинаково */}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => triggerSwipe('left')} className="ui-button ui-button--outline min-h-14!">
                <ArrowLeft size={20} /> Нет
              </button>
              <button type="button" onClick={() => triggerSwipe('right')} className="ui-button ui-button--outline min-h-14!">
                Да <ArrowRight size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
