import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Check, XCircle, X, Brain, ClipboardList } from 'lucide-react';
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
const API_URL = "https://friendly-various-near-across.trycloudflare.com";

export default function TestsTab({ onOverlayOpen }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openCategory, setOpenCategory] = useState(null);
  
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
    setCurrentQuestionIndex(0);
    setSelectedAnswers([]);
    setTestResult(null);
    setIsStarted(false);
    WebApp.HapticFeedback.impactOccurred('light');
    
    try {
      const response = await fetch(`${API_URL}/api/tests/${test.id}`, {
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      });
      if (response.ok) {
        const data = await response.json();
        setTestDetails(data);
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
                  {cat.tests.length === 0 ? (
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
                          <span className="flex items-center gap-1.5 text-green-500 text-[11px] sm:text-xs font-bold uppercase tracking-wider bg-emerald-500/10 px-2.5 py-1.5 rounded-lg whitespace-nowrap shrink-0">
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
              <div className="text-[#F5E6D3] text-sm sm:text-base leading-relaxed whitespace-pre-wrap">
                {selectedResult.result_text || 'Нет детального описания результата.'}
              </div>
            </div>
            <div className="p-4 sm:p-5 bg-rose-950/50 rounded-b-[2rem] flex flex-col gap-3">
              <button onClick={() => setSelectedResult(null)} className="w-full bg-rose-800 hover:bg-rose-700 text-[#F5E6D3] font-bold py-3.5 rounded-xl transition-all">
                Закрыть
              </button>
              <button onClick={handleRetake} className="w-full bg-emerald-600 hover:bg-emerald-500 text-[#F5E6D3] font-bold py-3.5 rounded-xl transition-all active:bg-emerald-700 shadow-lg shadow-emerald-900/20">
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
                  <span className="text-[#F5E6D3]/70 text-xs font-bold uppercase tracking-widest mb-2 text-center block">
                    Ваш результат
                  </span>
                  <div className="text-[#F5E6D3] text-base leading-relaxed whitespace-pre-wrap flex-1 overflow-y-auto pb-4">
                    {testResult}
                  </div>
                  <button onClick={closeTest} className="w-full mt-4 bg-blue-600 hover:bg-blue-500 text-[#F5E6D3] font-bold py-4 rounded-xl transition-all active:bg-blue-700 shadow-lg shadow-blue-900/20">
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
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl transition-colors shadow-lg flex justify-center items-center gap-2"
                >
                  Пройти тест
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full">
                <div className="mb-6 flex items-center justify-between">
                  <span className="text-[#F5E6D3]/60 font-semibold text-sm">
                    Вопрос {currentQuestionIndex + 1} из {testDetails.questions.length}
                  </span>
                  <div className="flex-1 ml-4 h-2 bg-rose-900/50 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-500 ease-out"
                      style={{ width: `${((currentQuestionIndex + 1) / testDetails.questions.length) * 100}%` }}
                    ></div>
                  </div>
                </div>
                
                <div className="bg-rose-900 rounded-[2rem] p-6 sm:p-8 shadow-xl mb-6">
                  <h4 className="text-xl sm:text-2xl font-bold text-[#F5E6D3] leading-snug">
                    {testDetails.questions[currentQuestionIndex].name}
                  </h4>
                </div>
                
                <div className="space-y-3 flex flex-col pb-8">
                  {testDetails.questions[currentQuestionIndex].answers.map(ans => (
                    <button
                      key={ans.id}
                      onClick={() => handleAnswerClick(ans.id)}
                      className="w-full bg-rose-800/40 hover:bg-rose-800 text-[#F5E6D3] font-medium text-left p-5 rounded-2xl transition-colors active:scale-[0.98]"
                    >
                      {ans.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
