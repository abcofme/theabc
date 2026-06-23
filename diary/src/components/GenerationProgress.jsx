import React, { useState, useEffect } from 'react';

const GenerationProgress = ({ text = "Генерация..." }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Симулируем прогресс. До 90% идет стабильно, потом замедляется
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev < 30) return prev + Math.random() * 5;
        if (prev < 70) return prev + Math.random() * 3;
        if (prev < 90) return prev + Math.random() * 1.5;
        if (prev < 99) return prev + Math.random() * 0.2;
        return 99; // Останавливаемся на 99% до получения реального ответа
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col w-full max-w-sm mx-auto my-8">
      <div className="flex justify-between items-end mb-2 px-1">
        <span className="text-[#F5E6D3] font-medium text-sm">{text}</span>
        <span className="text-[#F5E6D3]/70 font-bold text-xs">{Math.floor(progress)}%</span>
      </div>
      <div className="h-3 w-full bg-[#3D1418] rounded-full overflow-hidden shadow-inner">
        <div 
          className="h-full bg-gradient-to-r from-rose-500 to-rose-400 rounded-full transition-all duration-500 ease-out relative"
          style={{ width: `${progress}%` }}
        >
          {/* Блик на прогресс-баре для красоты */}
          <div className="absolute top-0 left-0 right-0 bottom-0 bg-white/20" style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
            animation: 'shimmer 2s infinite'
          }} />
        </div>
      </div>
      <p className="text-[#F5E6D3]/50 text-xs mt-3 text-center animate-pulse">
        Пожалуйста, подождите. Это может занять некоторое время.
      </p>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}} />
    </div>
  );
};

export default GenerationProgress;
