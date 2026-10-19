import { useState, useEffect } from 'react';
import DiaryTab from './features/diary/DiaryTab';
import ProfileProvider from './context/ProfileProvider';
import ProfileTab from './features/profile/ProfileTab';
import ReportsTab from './features/reports/ReportsTab';
import TestsTab from './features/tests/TestsTab';
import bgLeaves from './assets/bg-leaves.webp';
import diaryIcon from './assets/navigation/diary-clay.webp';
import testsIcon from './assets/navigation/tests-clay.webp';
import reportsIcon from './assets/navigation/reports-clay.webp';
import profileIcon from './assets/navigation/profile-clay.webp';
import './components/clay-navigation.css';

const WebApp = window.Telegram.WebApp;

export default function App() {
  const getInitialTab = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');
    return ['diary', 'tests', 'reports', 'profile'].includes(tab) ? tab : 'diary';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab());
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

  const [bgHeight, setBgHeight] = useState(() => `${window.innerHeight}px`);
  useEffect(() => {
    const handleResize = () => {
      // Ignore resize if keyboard is open
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        setBgHeight(`${window.innerHeight}px`);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Сообщаем Telegram, что приложение готово (один раз, а не на каждый рендер)
  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    // Полный экран только на телефонах: в Telegram на Mac/ПК он прячет кнопку закрытия
    if (WebApp.requestFullscreen && ['ios', 'android'].includes(WebApp.platform)) {
      WebApp.requestFullscreen();
    }
  }, []);

  // Блокировка: если нет данных от Telegram, не пускаем
  if (!WebApp.initData) {
    return (
      <div className="flex items-center justify-center h-screen bg-app text-center p-4">
        <div>
          <h2 className="text-2xl font-bold text-[#F5E6D3] mb-2">Доступ запрещен</h2>
          <p className="text-[#F5E6D3]">Дневник можно открыть только через нашего Telegram-бота.</p>
        </div>
      </div>
    );
  }

  return (
    <ProfileProvider>
    <div className="app-shell flex flex-col h-full font-sans bg-app relative">
      <div 
        className="fixed top-0 left-0 w-screen pointer-events-none z-0 transition-all duration-300"
        style={{
          height: bgHeight,
          backgroundImage: `url(${bgLeaves})`,
          backgroundPosition: `right 0px bottom ${isNavHidden ? '-10px' : 'calc(45px + env(safe-area-inset-bottom))'}`,
          backgroundRepeat: "no-repeat",
          backgroundSize: "60%"
        }}
      />

      <main
        className={`flex-1 flex flex-col overflow-y-auto p-4 relative z-10 ${isNavHidden ? '' : 'pb-24'}`}
      >
        <div className="flex-1 flex-col" style={{ display: activeTab === 'diary' ? 'flex' : 'none' }}>
          <DiaryTab onSheetOpen={setIsNavHidden} onSwitchTab={setActiveTab} />
        </div>
        <div className="flex-1 flex-col" style={{ display: activeTab === 'tests' ? 'flex' : 'none' }}>
          <TestsTab onOverlayOpen={setIsNavHidden} />
        </div>
        <div className="flex-1 flex-col" style={{ display: activeTab === 'reports' ? 'flex' : 'none' }}>
          <ReportsTab onSwitchTab={setActiveTab} />
        </div>
        <div className="flex-1 flex-col" style={{ display: activeTab === 'profile' ? 'flex' : 'none' }}>
          <ProfileTab onOverlayOpen={setIsNavHidden} />
        </div>
      </main>

      {/* Отрисовываем меню только если isNavHidden === false и клавиатура не открыта */}
      {(!isNavHidden && !isKeyboardOpen) && (
        <nav aria-label="Главное меню" className="fixed bottom-0 left-0 w-full bg-app-menu border-t border-[#F5E6D3]/10 flex justify-between p-2 pb-safe z-50">
          <button
            type="button"
            aria-current={activeTab === 'diary' ? 'page' : undefined}
            onClick={() => setActiveTab('diary')}
            className={`clay-navigation__item flex-1 flex flex-col items-center justify-center py-2 transition-all duration-300 ${
              activeTab === 'diary' ? 'text-[#F5E6D3]' : 'text-[#F5E6D3]/60 hover:text-[#F5E6D3]/80'
            }`}
          >
            <img src={diaryIcon} className="clay-navigation__icon" width="32" height="32" alt="" draggable="false" />
            <span className={`text-[10px] mt-1 ${activeTab === 'diary' ? 'font-bold' : ''}`}>Дневник</span>
          </button>
          <button
            type="button"
            aria-current={activeTab === 'tests' ? 'page' : undefined}
            onClick={() => setActiveTab('tests')}
            className={`clay-navigation__item flex-1 flex flex-col items-center justify-center py-2 transition-all duration-300 ${
              activeTab === 'tests' ? 'text-[#F5E6D3]' : 'text-[#F5E6D3]/60 hover:text-[#F5E6D3]/80'
            }`}
          >
            <img src={testsIcon} className="clay-navigation__icon" width="32" height="32" alt="" draggable="false" />
            <span className={`text-[10px] mt-1 ${activeTab === 'tests' ? 'font-bold' : ''}`}>Тесты</span>
          </button>
          <button
            type="button"
            aria-current={activeTab === 'reports' ? 'page' : undefined}
            onClick={() => setActiveTab('reports')}
            className={`clay-navigation__item flex-1 flex flex-col items-center justify-center py-2 transition-all duration-300 ${
              activeTab === 'reports' ? 'text-[#F5E6D3]' : 'text-[#F5E6D3]/60 hover:text-[#F5E6D3]/80'
            }`}
          >
            <img src={reportsIcon} className="clay-navigation__icon" width="32" height="32" alt="" draggable="false" />
            <span className={`text-[10px] mt-1 ${activeTab === 'reports' ? 'font-bold' : ''}`}>Отчеты</span>
          </button>
          <button
            type="button"
            aria-current={activeTab === 'profile' ? 'page' : undefined}
            onClick={() => setActiveTab('profile')}
            className={`clay-navigation__item flex-1 flex flex-col items-center justify-center py-2 transition-all duration-300 ${
              activeTab === 'profile' ? 'text-[#F5E6D3]' : 'text-[#F5E6D3]/60 hover:text-[#F5E6D3]/80'
            }`}
          >
            <img src={profileIcon} className="clay-navigation__icon" width="32" height="32" alt="" draggable="false" />
            <span className={`text-[10px] mt-1 ${activeTab === 'profile' ? 'font-bold' : ''}`}>Профиль</span>
          </button>
        </nav>
      )}
    </div>
    </ProfileProvider>
  );
}
