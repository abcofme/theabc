import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Check, XCircle, X, Brain, ClipboardList, Lock, Sparkles, ArrowLeft, ArrowRight, Undo2 } from 'lucide-react';
import bgLeaves from '../../assets/bg-leaves.png';

import iconPersonality from '../../assets/icons/personality.png';
import iconSelfEsteem from '../../assets/icons/self_esteem.png';
import iconTemperament from '../../assets/icons/temperament.png';
import iconSociability from '../../assets/icons/sociability.png';
import iconCareer from '../../assets/icons/career.png';

const categoryIcons = {
  "Личность": iconPersonality,
  "Самооценка": iconSelfEsteem,
  "Темперамент": iconTemperament,
  "Общительность": iconSociability,
  "Профориентация": iconCareer
};

const WebApp = window.Telegram.WebApp;
const API_URL = window.location.origin;

export default function TestsTab({ onOverlayOpen }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openCategory, setOpenCategory] = useState(null);
  const [hasCareerAccess, setHasCareerAccess] = useState(false);
  const [accessLevel, setAccessLevel] = useState('');
  const [isBuyingCareer, setIsBuyingCareer] = useState(false);
  
  // States for viewing a past result
  const [selectedResult, setSelectedResult] = useState(null);
  
  // States for taking a test
  const [takingTestId, setTakingTestId] = useState(null);
  const [testDetails, setTestDetails] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState([]); // array of answer_ids
  const [isStarted, setIsStarted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [testResult, setTestResult] = useState(null);

  // Auto-save progress
  useEffect(() => {
    if (takingTestId && isStarted && !isSubmitting && !testResult) {
      localStorage.setItem(`test_progress_${takingTestId}`, JSON.stringify({
        answers: selectedAnswers,
        index: currentQuestionIndex
      }));
    }
  }, [takingTestId, currentQuestionIndex, selectedAnswers, isStarted, isSubmitting, testResult]);

  // Swipe states
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [swipingOut, setSwipingOut] = useState(null);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);


  useEffect(() => {
    if (onOverlayOpen) {
      onOverlayOpen(!!takingTestId || !!selectedResult);
    }
  }, [takingTestId, selectedResult, onOverlayOpen]);

  const fetchCategories = () => {
    if (WebApp.initData) {
      fetch(`${API_URL}/api/profile`, {
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      })
      .then(res => res.json())
      .then(data => {
        setCategories(data.categories || []);
        setHasCareerAccess(data.has_career_access || false);
        setAccessLevel(data.access_level || '');
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading tests:", err);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const toggleCategory = (id) => setOpenCategory(openCategory === id ? null : id);

  const openTest = async (test) => {
    if (test.passed) {
      setSelectedResult(test);
      WebApp.HapticFeedback.selectionChanged();
      return;
    }
    
    // Begin test taking
    setTakingTestId(test.id);
    setTestDetails(null);
    setTestResult(null);
    setIsStarted(false);
    WebApp.HapticFeedback.impactOccurred('light');
    
    const saved = localStorage.getItem(`test_progress_${test.id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSelectedAnswers(parsed.answers || []);
        setCurrentQuestionIndex(parsed.index || 0);
      } catch (e) {
        setSelectedAnswers([]);
        setCurrentQuestionIndex(0);
      }
    } else {
      setSelectedAnswers([]);
      setCurrentQuestionIndex(0);
    }
    
    try {
      const response = await fetch(`${API_URL}/api/tests/${test.id}`, {
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      });
      if (response.ok) {
        const data = await response.json();
        setTestDetails(data);
        
        // Защита от краша: если вопросы удалили/изменили, а в кэше индекс больше допустимого
        setCurrentQuestionIndex(prev => {
          if (!data.questions || data.questions.length === 0) return 0;
          return Math.min(prev, data.questions.length - 1);
        });
        setSelectedAnswers(prev => {
          if (!data.questions || data.questions.length === 0) return [];
          return prev.slice(0, Math.min(prev.length, data.questions.length - 1));
        });
      } else {
        WebApp.showAlert("Ошибка при загрузке теста");
        setTakingTestId(null);
      }
    } catch (err) {
      console.error(err);
      WebApp.showAlert("Ошибка сети");
      setTakingTestId(null);
    }
  };

  const handleAnswerClick = async (answerId) => {
    WebApp.HapticFeedback.selectionChanged();
    const newAnswers = [...selectedAnswers, answerId];
    setSelectedAnswers(newAnswers);
    
    if (currentQuestionIndex < testDetails.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      // Submit test
      setIsSubmitting(true);
      localStorage.removeItem(`test_progress_${testDetails.id}`);
      try {
        const response = await fetch(`${API_URL}/api/tests/${testDetails.id}/submit`, {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${WebApp.initData}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ answer_ids: newAnswers })
        });
          if (!response.ok) {
            let errText = await response.text();
            WebApp.showAlert(`Ошибка сервера: ${response.status} ${errText.substring(0, 50)}`);
            return;
          }
          
          const data = await response.json();
          setTestResult(data.result);
          WebApp.HapticFeedback.notificationOccurred('success');
          // refresh categories
          fetchCategories();
        } catch (err) {
          WebApp.showAlert(`Ошибка сети или парсинга: ${err.message}`);
        } finally {
        setIsSubmitting(false);
      }
    }
  };

  const closeTest = () => {
    setTakingTestId(null);
    setTestDetails(null);
    setTestResult(null);
    setIsStarted(false);
  };

  const handleExit = () => {
    if (takingTestId && currentQuestionIndex > 0) {
      localStorage.setItem(`test_progress_${takingTestId}`, JSON.stringify({
        answers: selectedAnswers,
        index: currentQuestionIndex
      }));
    }
    closeTest();
  };

  const handleGoBack = () => {
    if (currentQuestionIndex > 0) {
      WebApp.HapticFeedback.impactOccurred('light');
      setCurrentQuestionIndex(prev => prev - 1);
      setSelectedAnswers(prev => prev.slice(0, -1));
    }
  };

  const handleRetake = async () => {
    try {
      const resId = selectedResult.id;
      const response = await fetch(`${API_URL}/api/tests/${resId}/progress`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      });
      if (response.ok) {
        const testToRetake = { ...selectedResult, passed: false };
        setSelectedResult(null);
        fetchCategories();
        openTest(testToRetake);
      } else {
        WebApp.showAlert("Ошибка при сбросе теста");
      }
    } catch (err) {
      console.error(err);
      WebApp.showAlert("Ошибка сети при сбросе теста");
    }
  };

  const buyCareerGuidance = async () => {
    if (accessLevel !== 'Premium') {
      WebApp.showAlert("Для покупки блока 'Профориентация' необходимо сначала оформить Premium подписку в Профиле.");
      return;
    }
    setIsBuyingCareer(true);
    try {
      const response = await fetch(`${API_URL}/api/career/buy`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WebApp.initData}`,
          "Content-Type": "application/json"
        }
      });
      const data = await response.json();
      if (response.ok) {
        WebApp.openLink(data.url);
      } else {
        WebApp.showAlert(`Ошибка: ${data.detail || "Не удалось создать платеж"}`);
      }
    } catch (err) {
      WebApp.showAlert(`Ошибка сети: ${err.message}`);
    } finally {
      setIsBuyingCareer(false);
    }
  };


  const handleTouchStart = (e) => {
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
    
    const currentQ = testDetails.questions[currentQuestionIndex];
    let chosenAnswerId = null;
    
    if (isYes) {
      const ans = currentQ.answers.find(a => a.name.toLowerCase().includes('да') || a.name.toLowerCase() === 'верно') || currentQ.answers[0];
      chosenAnswerId = ans.id;
    } else {
      const ans = currentQ.answers.find(a => a.name.toLowerCase().includes('нет') || a.name.toLowerCase() === 'неверно') || currentQ.answers[1] || currentQ.answers[0];
      chosenAnswerId = ans.id;
    }
    
    setTimeout(() => {
      handleAnswerClick(chosenAnswerId);
      setDragOffset(0);
      setSwipingOut(null);
    }, 450);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (dragOffset > 80) {
      executeSwipe('right');
    } else if (dragOffset < -80) {
      executeSwipe('left');
    } else {
      setDragOffset(0);
    }
  };

  const triggerSwipe = (direction) => {
    if (swipingOut) return;
    setIsDragging(false);
    setDragOffset(direction === 'right' ? 300 : -300);
    executeSwipe(direction);
  };

  return (

    <div className="flex flex-col relative select-none bg-transparent max-w-2xl mx-auto w-full pt-4 h-full overflow-y-scroll pb-16">
      <h2 className="text-2xl font-bold text-[#F5E6D3] px-4 mb-8 text-center flex items-center justify-center gap-2">
        <ClipboardList size={28} />
        Тесты
      </h2>
      
      {/* Список категорий */}
      <div className="px-4 pb-6 space-y-3 animate-in fade-in duration-300 flex flex-col flex-1">
        {loading ? (
          <div className="flex justify-center items-center py-12 flex-1">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#F5E6D3] border-t-transparent"></div>
          </div>
        ) : categories.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[#F5E6D3] text-center py-12">
            <p>Нет доступных тестов.</p>
          </div>
        ) : (
          categories.map(cat => (
            <div key={cat.id} className="bg-rose-900 rounded-2xl overflow-hidden shadow-sm transition-all duration-300">
              <button
                onClick={() => toggleCategory(cat.id)}
                className={`w-full relative flex items-center px-6 py-4 min-h-[80px] hover:bg-rose-800/70 transition-colors active:bg-rose-800 overflow-hidden isolate ${openCategory === cat.id ? 'rounded-t-2xl' : 'rounded-2xl'} justify-between`}
              >
                <div className="flex items-center justify-between gap-4 z-10 relative text-left w-full">
                  <div className="flex items-center gap-3">
                    {categoryIcons[cat.name.trim()] && (
                      <img 
                        src={categoryIcons[cat.name.trim()]} 
                        alt="" 
                        className="w-10 h-10 object-contain drop-shadow-md"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <span className="font-semibold text-[#F5E6D3] text-xl sm:text-2xl leading-tight">
                      {cat.name}
                    </span>
                  </div>
                  {openCategory === cat.id ? (
                    <ChevronUp size={28} className="text-[#F5E6D3] shrink-0" />
                  ) : (
                    <ChevronDown size={28} className="text-[#F5E6D3] shrink-0" />
                  )}
                </div>
              </button>

              {openCategory === cat.id && (
                <div className="bg-rose-950/40 px-4 py-2 animate-in fade-in slide-in-from-top-4 duration-500 ease-out">
                  {cat.name === 'Профориентация' && !hasCareerAccess ? (
                    <div className="py-6 flex flex-col items-center justify-center text-center px-2">
                      <div className="w-12 h-12 rounded-full bg-rose-900/50 flex items-center justify-center mb-3">
                        <span className="text-2xl"><Lock size={24} /></span>
                      </div>
                      <h3 className="text-[#F5E6D3] font-bold text-lg mb-2">Блок Профориентация</h3>
                      <p className="text-[#F5E6D3]/70 text-sm mb-4">
                        Для прохождения тестов по профориентации необходимо приобрести этот блок за 1499 ₽ (единоразово). Доступно только для Premium-пользователей.
                      </p>
                      <button
                        onClick={buyCareerGuidance}
                        disabled={isBuyingCareer}
                        className="w-full py-3.5 bg-emerald-800 hover:bg-emerald-800 text-[#F5E6D3] font-bold rounded-2xl shadow-sm transition-colors flex justify-center items-center gap-2"
                      >
                        {isBuyingCareer ? <span className="animate-spin text-xl">⏳</span> : "Купить за 1499 ₽"}
                      </button>
                    </div>
                  ) : cat.tests.length === 0 ? (
                    <div className="text-[#F5E6D3] text-sm py-3 italic">В этой категории пока нет тестов.</div>
                  ) : (
                    cat.tests.map(test => (
                      <div
                        key={test.id}
                        onClick={() => openTest(test)}
                        className="flex items-center justify-between py-3.5 last: cursor-pointer hover:bg-rose-800/40 -mx-4 px-4 transition-colors active:bg-rose-800"
                      >
                        <span className={`text-sm sm:text-base font-medium pr-3 text-[#F5E6D3] flex-1 leading-snug ${!test.passed && 'opacity-90'}`}>
                          {test.name}
                        </span>
                        {test.passed ? (
                          <span className="flex items-center gap-1.5 text-emerald-500 text-[11px] sm:text-xs font-bold uppercase tracking-wider bg-emerald-800/10 px-2.5 py-1.5 rounded-lg whitespace-nowrap shrink-0">
                            <Check size={14} /> Пройден
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-[#F5E6D3]/60 text-[11px] sm:text-xs font-bold uppercase tracking-wider bg-rose-950/50 px-2.5 py-1.5 rounded-lg whitespace-nowrap shrink-0">
                            Пройти
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Модальное окно ПРОШЛОГО РЕЗУЛЬТАТА */}
      {selectedResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-rose-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="absolute inset-0" onClick={() => setSelectedResult(null)}></div>
          <div className="relative bg-rose-900 rounded-[2rem] w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300">

            <div className="p-5 sm:p-6 overflow-y-auto">
              <div className="text-[#F5E6D3] text-sm sm:text-base leading-relaxed whitespace-pre-wrap font-bold">
                {selectedResult.result_text || 'Нет детального описания результата.'}
              </div>
            </div>
            <div className="p-4 sm:p-5 bg-rose-950/50 rounded-b-[2rem] flex flex-col gap-3">
              <button onClick={() => setSelectedResult(null)} className="w-full bg-rose-800 hover:bg-rose-700 text-[#F5E6D3] font-bold py-3.5 rounded-xl transition-all">
                Закрыть
              </button>
              <button onClick={handleRetake} className="w-full bg-emerald-800 hover:bg-emerald-800 text-[#F5E6D3] font-bold py-3.5 rounded-xl transition-all active:bg-emerald-800 shadow-lg shadow-emerald-900/20">
                Пройти тест заново
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Полноэкранный интерфейс ПРОХОЖДЕНИЯ ТЕСТА */}
      {takingTestId && (
        <div className="fixed inset-0 z-50 flex flex-col bg-rose-950 animate-in fade-in slide-in-from-bottom-8 duration-300">
          <div 
            className="absolute inset-0 pointer-events-none z-0"
            style={{
              backgroundImage: `url(${bgLeaves})`,
              backgroundPosition: "bottom right",
              backgroundRepeat: "no-repeat",
              backgroundSize: "60%"
            }}
          />

          
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col relative z-10">
            {!testDetails ? (
              <div className="flex-1 flex justify-center items-center">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#F5E6D3] border-t-transparent"></div>
              </div>
            ) : testResult ? (
              <div className="flex-1 flex flex-col animate-in zoom-in-95 duration-300">
                <div className="flex-1 bg-rose-900 rounded-[2rem] p-6 shadow-xl flex flex-col">
                  <div className="text-[#F5E6D3] text-base leading-relaxed whitespace-pre-wrap flex-1 overflow-y-auto pb-4 font-bold">
                    {testResult}
                  </div>
                  <button onClick={closeTest} className="w-full mt-4 bg-emerald-800 hover:bg-emerald-800 text-[#F5E6D3] font-bold py-4 rounded-xl transition-all active:bg-emerald-900 shadow-lg shadow-emerald-950/20">
                    Вернуться к тестам
                  </button>
                </div>
              </div>
            ) : isSubmitting ? (
              <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#F5E6D3] border-t-transparent"></div>
                <p className="text-[#F5E6D3] font-medium text-lg">Обработка результатов...</p>
              </div>
            ) : !isStarted ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-300 max-w-md mx-auto w-full">
                <div className="bg-rose-900 rounded-[2rem] p-6 sm:p-8 shadow-xl mb-6 w-full">
                  <h4 className="text-xl sm:text-2xl font-bold text-[#F5E6D3] leading-snug mb-4">
                    {testDetails.name}
                  </h4>
                  {testDetails.description && (
                    <p className="text-[#F5E6D3]/70 text-sm mb-4">
                      {testDetails.description}
                    </p>
                  )}
                  <p className="text-[#F5E6D3]/50 text-xs font-bold uppercase tracking-widest">
                    Вопросов: {testDetails.questions?.length || 0}
                  </p>
                </div>
                <button 
                  onClick={() => setIsStarted(true)} 
                  className="w-full bg-emerald-800 hover:bg-emerald-800 text-white font-bold py-4 rounded-xl transition-colors shadow-lg flex justify-center items-center gap-2 mb-3"
                >
                  {currentQuestionIndex > 0 ? "Продолжить тест" : "Пройти тест"}
                </button>
                <button 
                  onClick={handleExit} 
                  className="w-full bg-rose-900/50 hover:bg-rose-800 text-[#F5E6D3]/70 hover:text-red-300 font-bold py-3 rounded-xl transition-colors flex justify-center items-center gap-2"
                >
                  Закрыть
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col max-w-md mx-auto w-full relative">
                <div className="mb-4 flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    {currentQuestionIndex > 0 && (
                      <button onClick={handleGoBack} className="text-[#F5E6D3]/60 hover:text-[#F5E6D3] p-1 active:scale-95 transition-all">
                        <Undo2 size={24} />
                      </button>
                    )}
                    <span className="text-[#F5E6D3]/60 font-semibold text-sm whitespace-nowrap">
                      Вопрос {currentQuestionIndex + 1} из {testDetails.questions.length}
                    </span>
                  </div>
                  
                  <div className="flex-1 mx-4 h-2 bg-rose-900/50 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-800 transition-all duration-500 ease-out"
                      style={{ width: `${((currentQuestionIndex + 1) / testDetails.questions.length) * 100}%` }}
                    ></div>
                  </div>
                  <button onClick={handleExit} className="text-[#F5E6D3]/60 hover:text-red-400 p-1 active:scale-95 transition-all">
                    <X size={24} />
                  </button>
                </div>
                
                {/* Cards Stack Container */}
                <div className="relative flex-1 flex flex-col w-full min-h-[400px] mb-8 perspective-1000">
                  {/* Next Card (Underneath) */}
                  {currentQuestionIndex + 1 < testDetails.questions.length && (
                    <div className="absolute inset-2 bg-rose-900/80 rounded-[2rem] p-6 sm:p-8 shadow-sm flex items-center justify-center text-center opacity-70 blur-[3px] select-none transition-all duration-500 ease-out">
                       <h4 className="text-xl sm:text-2xl font-bold text-[#F5E6D3] leading-snug">
                         {testDetails.questions[currentQuestionIndex + 1].name}
                       </h4>
                    </div>
                  )}
                  
                  {/* Current Card */}
                  <div 
                    key={currentQuestionIndex}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    className={`absolute inset-2 bg-rose-900/80 backdrop-blur-md rounded-[2rem] p-6 sm:p-8 shadow-2xl flex flex-col items-center justify-center text-center overflow-hidden cursor-grab active:cursor-grabbing select-none
                      animate-in fade-in zoom-in-[0.96] duration-500 ease-out
                      ${isDragging ? 'transition-none' : 'transition-all duration-500 ease-out'}
                      ${swipingOut === 'right' ? 'translate-x-[150%] rotate-[10deg] opacity-0' : ''}
                      ${swipingOut === 'left' ? '-translate-x-[150%] -rotate-[10deg] opacity-0' : ''}
                    `}
                    style={(!swipingOut && isDragging) ? {
                      transform: `translateX(${dragOffset}px) rotate(${dragOffset * 0.05}deg)`
                    } : {}}
                  >
                    {/* Overlay for Color Hint */}
                    <div 
                      className={`absolute inset-0 transition-opacity duration-200 ${dragOffset > 0 ? 'bg-emerald-800' : 'bg-red-500'}`}
                      style={{ opacity: Math.min(Math.abs(dragOffset) / 300, 0.4) }}
                    />
                    
                    {/* Question Text */}
                    <div className="flex-1 flex items-center justify-center w-full relative z-10 pointer-events-none mb-16">
                      <h4 className="text-xl sm:text-2xl font-bold text-[#F5E6D3] leading-snug">
                        {testDetails.questions[currentQuestionIndex]?.name || 'Вопрос загружается...'}
                      </h4>
                    </div>
                    
                    {/* Buttons inside the card */}
                    <div className="absolute bottom-6 inset-x-6 flex justify-between items-center z-20">
                      <button 
                        onClick={(e) => { e.stopPropagation(); triggerSwipe('left'); }} 
                        onTouchEnd={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 bg-red-800/90 hover:bg-red-700 text-[#F5E6D3] font-bold tracking-wider uppercase px-5 py-3.5 rounded-xl backdrop-blur-sm transition-colors active:scale-95"
                      >
                        <ArrowLeft size={20} /> Нет
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); triggerSwipe('right'); }} 
                        onTouchEnd={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 bg-emerald-800/90 hover:bg-emerald-800 text-[#F5E6D3] font-bold tracking-wider uppercase px-5 py-3.5 rounded-xl backdrop-blur-sm transition-colors active:scale-95"
                      >
                        Да <ArrowRight size={20} />
                      </button>
                    </div>

                    {/* Indicators "ДА" / "НЕТ" on the card edges */}
                    <div className="absolute top-8 left-6 border-4 border-emerald-500 text-emerald-500 font-black text-3xl px-4 py-1 rounded-xl transform -rotate-12 opacity-0 transition-opacity pointer-events-none duration-200" style={{ opacity: dragOffset > 30 ? Math.min(dragOffset/100, 1) : 0 }}>
                      ДА
                    </div>
                    <div className="absolute top-8 right-6 border-4 border-red-500 text-red-500 font-black text-3xl px-4 py-1 rounded-xl transform rotate-12 opacity-0 transition-opacity pointer-events-none duration-200" style={{ opacity: dragOffset < -30 ? Math.min(-dragOffset/100, 1) : 0 }}>
                      НЕТ
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
