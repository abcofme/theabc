import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Sparkles, User, Brain, ClipboardList } from 'lucide-react';
import CalendarTab from './features/calendar/CalendarTab';
import ProfileTab from './features/profile/ProfileTab';
import ReportsTab from './features/reports/ReportsTab';
import TestsTab from './features/tests/TestsTab';
import bgLeaves from './assets/bg-leaves.png';

const WebApp = window.Telegram.WebApp;

export default function App() {
  const [activeTab, setActiveTab] = useState('diary');
  const [isNavHidden, setIsNavHidden] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const handleFocus = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        setIsKeyboardOpen(true);
      }
    };
    const handleBlur = () => {
      // Small timeout to prevent flickering if focus moves between inputs
      setTimeout(() => {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          setIsKeyboardOpen(false);
        }
      }, 50);
    };
    document.addEventListener('focusin', handleFocus);
    document.addEventListener('focusout', handleBlur);
    return () => {
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('focusout', handleBlur);
    };
  }, []);

  // Сообщаем Telegram, что приложение готово
  WebApp.ready();

  // Блокировка: если нет данных от Telegram, не пускаем
  if (!WebApp.initData) {
    return (
      <div className="flex items-center justify-center h-screen bg-rose-950 text-center p-4">
        <div>
          <h2 className="text-2xl font-bold text-[#F5E6D3] mb-2">Доступ запрещен</h2>
          <p className="text-[#F5E6D3]">Дневник можно открыть только через нашего Telegram-бота.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full font-sans bg-rose-950 relative">
      <div 
        className="absolute top-0 left-0 right-0 bottom-[75px] pointer-events-none z-0"
        style={{
          backgroundImage: `url(${bgLeaves})`,
          backgroundPosition: "bottom right",
          backgroundRepeat: "no-repeat",
          backgroundSize: "60%"
        }}
      />
      <main className={`flex-1 overflow-y-auto p-4 relative z-10 ${isNavHidden ? '' : 'pb-24'}`}>
        {/* Передаем функцию скрытия меню в CalendarTab */}
        {activeTab === 'diary' && <CalendarTab onSheetOpen={setIsNavHidden} />}
        {activeTab === 'tests' && <TestsTab onOverlayOpen={setIsNavHidden} />}
        {activeTab === 'reports' && <ReportsTab />}
        {activeTab === 'profile' && <ProfileTab />}
      </main>

      {/* Отрисовываем меню только если isNavHidden === false и клавиатура не открыта */}
      {(!isNavHidden && !isKeyboardOpen) && (
        <nav className="fixed bottom-0 left-0 w-full bg-rose-900 flex justify-between p-2 pb-safe z-50 border-t-4 border-[#F5E6D3]">
          <button
            onClick={() => setActiveTab('diary')}
            className={`flex-1 flex flex-col items-center justify-center py-2 transition-all duration-300 ${
              activeTab === 'diary' ? 'text-[#F5E6D3] scale-110 drop-shadow-md' : 'text-[#F5E6D3]/60 hover:text-[#F5E6D3]/80'
            }`}
          >
            <CalendarIcon size={24} />
            <span className={`text-[10px] mt-1 ${activeTab === 'diary' ? 'font-bold' : ''}`}>Дневник</span>
          </button>
          <button
            onClick={() => setActiveTab('tests')}
            className={`flex-1 flex flex-col items-center justify-center py-2 transition-all duration-300 ${
              activeTab === 'tests' ? 'text-[#F5E6D3] scale-110 drop-shadow-md' : 'text-[#F5E6D3]/60 hover:text-[#F5E6D3]/80'
            }`}
          >
            <ClipboardList size={24} />
            <span className={`text-[10px] mt-1 ${activeTab === 'tests' ? 'font-bold' : ''}`}>Тесты</span>
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`flex-1 flex flex-col items-center justify-center py-2 transition-all duration-300 ${
              activeTab === 'reports' ? 'text-[#F5E6D3] scale-110 drop-shadow-md' : 'text-[#F5E6D3]/60 hover:text-[#F5E6D3]/80'
            }`}
          >
            <Brain size={24} />
            <span className={`text-[10px] mt-1 ${activeTab === 'reports' ? 'font-bold' : ''}`}>Отчеты</span>
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 flex flex-col items-center justify-center py-2 transition-all duration-300 ${
              activeTab === 'profile' ? 'text-[#F5E6D3] scale-110 drop-shadow-md' : 'text-[#F5E6D3]/60 hover:text-[#F5E6D3]/80'
            }`}
          >
            <User size={24} />
            <span className={`text-[10px] mt-1 ${activeTab === 'profile' ? 'font-bold' : ''}`}>Профиль</span>
          </button>
        </nav>
      )}
    </div>
  );
}
