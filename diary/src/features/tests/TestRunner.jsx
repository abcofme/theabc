import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ArrowLeft, ArrowRight, Undo2, Wand2 } from 'lucide-react';
import bgLeaves from '../../assets/bg-leaves.webp';
import Spinner from '../../components/Spinner';
import { useBackHandler } from '../../navigation/backStack';
import { useAppNav, useErrorHandler } from '../../navigation/appNav';
import { useProfile, portraitState } from '../../context/profile';
import { api } from '../../utils/api';

const WebApp = window.Telegram.WebApp;

const TUTORIAL_KEY = 'swipe_tutorial_seen';
// Примерно столько уходит на один ответ свайпом
const SECONDS_PER_QUESTION = 5;

const progressKey = (testId) => `test_progress_${testId}`;

function readSaved(testId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(progressKey(testId)));
    return { answers: parsed?.answers || [], index: parsed?.index || 0 };
  } catch {
    return { answers: [], index: 0 };
  }
}

function storage(action) {
  try {
    return action(localStorage);
  } catch {
    return null;
  }
}

// Прохождение теста отдельной страницей: старт, карточки-свайпы «да/нет», результат
export default function TestRunner({ test, onClose }) {
  const { profile, refreshProfile, generatePortrait } = useProfile();
  const { navigate } = useAppNav();
  const handleError = useErrorHandler();
  const [saved] = useState(() => readSaved(test.id));
  const [details, setDetails] = useState(null);
  const [index, setIndex] = useState(saved.index);
  const [answers, setAnswers] = useState(saved.answers);
  const [isStarted, setIsStarted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
        const last = Math.max((data.questions?.length || 1) - 1, 0);
        setIndex(i => Math.min(i, last));
        setAnswers(a => a.slice(0, last));
      })
      .catch(err => {
        handleError(err, 'Не удалось загрузить тест');
        onCloseRef.current();
      });
  }, [test.id, handleError]);

  // Прогресс сохраняется, чтобы продолжить с того же вопроса
  useEffect(() => {
    if (isStarted && !isSubmitting && !result) {
      storage(s => s.setItem(progressKey(test.id), JSON.stringify({ answers, index })));
    }
  }, [test.id, index, answers, isStarted, isSubmitting, result]);

  // Подсказка про свайпы — только на первом тесте, до первого касания или ответа
  const dismissTutorial = () => {
    if (!showTutorial) return;
    setShowTutorial(false);
    storage(s => s.setItem(TUTORIAL_KEY, '1'));
  };

  const exit = () => onClose();
  useBackHandler(true, exit);

  const handleAnswerClick = async (answerId) => {
    WebApp.HapticFeedback?.selectionChanged();
    const newAnswers = [...answers, answerId];
    setAnswers(newAnswers);

    if (index < details.questions.length - 1) {
      setIndex(prev => prev + 1);
      return;
    }
    setIsSubmitting(true);
    storage(s => s.removeItem(progressKey(test.id)));
    try {
      const data = await api(`/api/tests/${details.id}/submit`, { method: 'POST', body: { answer_ids: newAnswers } });
      setResult(data.result);
      WebApp.HapticFeedback?.notificationOccurred('success');
      refreshProfile();
    } catch (err) {
      handleError(err, 'Не удалось сохранить результат теста. Попробуйте ещё раз.');
    } finally {
      setIsSubmitting(false);
    }
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
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{ backgroundImage: `url(${bgLeaves})`, backgroundPosition: 'bottom right', backgroundRepeat: 'no-repeat', backgroundSize: '60%' }}
      />

      <header className="relative z-10 shrink-0 w-full max-w-md mx-auto flex items-center gap-2 px-2 pt-3 pb-2">
        <button onClick={exit} aria-label="Назад" className="p-2 rounded-xl text-[#F5E6D3] active:scale-95 shrink-0">
          <ChevronLeft size={26} />
        </button>
        {isStarted && !result && details ? (
          <>
            <span className="text-[#F5E6D3]/70 font-semibold text-sm whitespace-nowrap">Вопрос {index + 1} из {questions.length}</span>
            <div className="flex-1 h-2 bg-rose-900/50 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-800 transition-all duration-500 ease-out" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
            </div>
            <button
              onClick={handleGoBack}
              disabled={index === 0}
              aria-label="Предыдущий вопрос"
              className="p-2 text-[#F5E6D3]/70 disabled:opacity-30 active:scale-95 shrink-0"
            >
              <Undo2 size={22} />
            </button>
          </>
        ) : (
          <h2 className="text-xl font-bold text-[#F5E6D3] truncate">{test.name}</h2>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col relative z-10">
        {!details ? (
          <Spinner className="flex-1" />
        ) : result ? (
          <div className="flex-1 flex flex-col max-w-md mx-auto w-full">
            <div className="flex-1 bg-rose-900 rounded-[2rem] p-6 shadow-xl flex flex-col">
              <p className="text-xs font-bold text-[#F5E6D3]/70 uppercase tracking-wider mb-3">Результат</p>
              <div className="text-[#F5E6D3] text-base leading-relaxed whitespace-pre-wrap flex-1 overflow-y-auto pb-4">{result}</div>
              {portraitState(profile) === 'ready' ? (
                <>
                  <p className="text-sm text-[#F5E6D3]/80 mt-2">Все тесты пройдены — можно сформировать портрет личности.</p>
                  <button onClick={makePortrait} className="w-full mt-4 bg-emerald-800 text-[#F5E6D3] font-bold py-4 rounded-xl flex items-center justify-center gap-2 active:scale-[0.98]">
                    <Wand2 size={18} /> Сформировать портрет
                  </button>
                  <button onClick={exit} className="w-full mt-2 py-3 text-[#F5E6D3]/70 font-medium">Позже</button>
                </>
              ) : (
                <button onClick={exit} className="w-full mt-4 bg-emerald-800 text-[#F5E6D3] font-bold py-4 rounded-xl active:scale-[0.98]">
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
        ) : !isStarted ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto w-full">
            <div className="bg-rose-900 rounded-[2rem] p-6 sm:p-8 shadow-xl mb-6 w-full">
              <h3 className="text-xl sm:text-2xl font-bold text-[#F5E6D3] leading-snug mb-4">{details.name}</h3>
              {details.description && <p className="text-[#F5E6D3]/70 text-sm mb-4">{details.description}</p>}
              <p className="text-[#F5E6D3]/50 text-xs font-bold uppercase tracking-widest">
                Вопросов: {questions.length} · около {minutes} мин
              </p>
            </div>
            <button
              onClick={() => setIsStarted(true)}
              className="w-full bg-emerald-800 text-[#F5E6D3] font-bold py-4 rounded-xl shadow-lg active:scale-[0.98]"
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
            <div className="relative flex-1 flex flex-col w-full min-h-[400px] mb-8">
              {/* Следующая карточка — под текущей */}
              {index + 1 < questions.length && (
                <div className="absolute inset-2 bg-rose-900/80 rounded-[2rem] p-6 sm:p-8 shadow-sm flex items-center justify-center text-center opacity-70 blur-[3px] select-none">
                  <h4 className="text-xl sm:text-2xl font-bold text-[#F5E6D3] leading-snug">{questions[index + 1].name}</h4>
                </div>
              )}

              <div
                key={index}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className={`absolute inset-2 bg-rose-900/80 backdrop-blur-md rounded-[2rem] p-6 sm:p-8 shadow-2xl flex flex-col items-center justify-center text-center overflow-hidden cursor-grab active:cursor-grabbing select-none
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

                <div className="flex-1 flex flex-col justify-center w-full relative z-10 overflow-y-auto overflow-x-hidden mb-16 pointer-events-auto px-2">
                  <div className="flex items-center min-h-full">
                    <h4 className="text-lg sm:text-xl md:text-2xl font-bold text-[#F5E6D3] leading-snug mx-auto w-full max-h-full">
                      {questions[index]?.name || 'Вопрос загружается...'}
                    </h4>
                  </div>
                </div>

                <div className="absolute bottom-6 inset-x-6 flex justify-between items-center z-20">
                  <button
                    onClick={(e) => { e.stopPropagation(); triggerSwipe('left'); }}
                    onTouchEnd={(e) => e.stopPropagation()}
                    className="flex items-center gap-2 bg-rose-950/60 border border-[#F5E6D3]/25 text-[#F5E6D3] font-bold px-6 py-3.5 rounded-xl active:scale-95"
                  >
                    <ArrowLeft size={20} /> Нет
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); triggerSwipe('right'); }}
                    onTouchEnd={(e) => e.stopPropagation()}
                    className="flex items-center gap-2 bg-rose-950/60 border border-[#F5E6D3]/25 text-[#F5E6D3] font-bold px-6 py-3.5 rounded-xl active:scale-95"
                  >
                    Да <ArrowRight size={20} />
                  </button>
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
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
