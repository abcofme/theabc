import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import DiaryTab from './features/diary/DiaryTab';
import ProfileProvider from './context/ProfileProvider';
import BackStackProvider from './navigation/BackStackProvider';
import { useBackDepth } from './navigation/backStack';
import { AppNavContext } from './navigation/appNav';
import ProfileTab from './features/profile/ProfileTab';
import ReportsTab from './features/reports/ReportsTab';
import TestsTab from './features/tests/TestsTab';
import BillingPage from './features/billing/BillingPage';
import ScreenState from './components/ScreenState';
import TelegramChrome from './components/TelegramChrome';
import { useProfile } from './context/profile';
import diaryIcon from './assets/navigation/diary-clay.webp';
import testsIcon from './assets/navigation/tests-clay.webp';
import reportsIcon from './assets/navigation/reports-clay.webp';
import profileIcon from './assets/navigation/profile-clay.webp';
import './components/clay-navigation.css';

const WebApp = window.Telegram.WebApp;

const TABS = [
  { id: 'diary', label: 'Дневник', icon: diaryIcon },
  { id: 'tests', label: 'Тесты', icon: testsIcon },
  { id: 'reports', label: 'Отчеты', icon: reportsIcon },
  { id: 'profile', label: 'Профиль', icon: profileIcon },
];

const isTextField = (el) => el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA';

// Ссылки из бота открывают нужный экран: ?tab=reports&report=12, ?tab=reports&section=compatibility,
// ?tab=profile&page=portrait, ?page=billing
function readDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  const link = {
    tab: TABS.some(t => t.id === tab) ? tab : 'diary',
    page: params.get('page'),
    section: params.get('section'),
    report: params.get('report'),
    id: 0,
  };
  // Друзья раньше были в профиле: старые сообщения бота ведут туда
  if (link.tab === 'profile' && link.page === 'friends') {
    return { ...link, tab: 'reports', page: null, section: 'compatibility' };
  }
  return link;
}

export default function App() {
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
      <div className="flex items-center justify-center h-screen bg-rose-950 text-center p-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--ui-text)] mb-2">Доступ запрещен</h2>
          <p className="text-[var(--ui-text)]">Дневник можно открыть только через нашего Telegram-бота.</p>
        </div>
      </div>
    );
  }

  return (
    <ProfileProvider>
      <BackStackProvider>
        <TelegramChrome />
        <Shell />
      </BackStackProvider>
    </ProfileProvider>
  );
}

// Клавиатура открыта, пока фокус в поле ввода: прячем нижнее меню, чтобы оно не прыгало над ней
function useKeyboardOpen() {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    const onFocus = (e) => {
      if (isTextField(e.target)) setIsOpen(true);
    };
    const onBlur = () => {
      // Небольшая задержка, чтобы меню не мигало при переходе между полями
      setTimeout(() => {
        if (!isTextField(document.activeElement)) setIsOpen(false);
      }, 50);
    };
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    return () => {
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onBlur);
    };
  }, []);
  return isOpen;
}

function Shell() {
  const { profile, profileError, refreshProfile } = useProfile();
  const [request, setRequest] = useState(readDeepLink);
  const [activeTab, setActiveTab] = useState(request.tab);
  const [isBillingOpen, setIsBillingOpen] = useState(request.page === 'billing');
  const depth = useBackDepth();
  const isKeyboardOpen = useKeyboardOpen();
  const isNavHidden = depth > 0 || isKeyboardOpen;

  // У каждой вкладки своя позиция прокрутки: переход между вкладками её не переносит
  const mainRef = useRef(null);
  const scrollTops = useRef({});

  const selectTab = useCallback((tab) => {
    const main = mainRef.current;
    if (tab === activeTab) {
      main?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (main) scrollTops.current[activeTab] = main.scrollTop;
    setActiveTab(tab);
  }, [activeTab]);

  useLayoutEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = scrollTops.current[activeTab] || 0;
  }, [activeTab]);

  const navigate = useCallback((target) => {
    selectTab(target.tab);
    setRequest({ ...target, returnTo: target.page && target.tab !== activeTab ? activeTab : null, id: Date.now() });
  }, [selectTab, activeTab]);
  const openBilling = useCallback(() => setIsBillingOpen(true), []);
  const nav = useMemo(() => ({ navigate, openBilling }), [navigate, openBilling]);

  const requestFor = (tab) => (request.tab === tab ? request : null);

  return (
    <AppNavContext.Provider value={nav}>
      <div className="app-shell flex flex-col h-full font-sans bg-rose-950 relative">
        <main ref={mainRef} className={`app-main ${isNavHidden ? '' : 'app-main--with-nav'}`}>
          {!profile ? <ScreenState loading={!profileError} error={!!profileError} title={profileError ? 'Не удалось загрузить приложение' : 'Загружаем твои данные…'} onRetry={profileError ? refreshProfile : undefined} /> : <>
          <div className="flex-1 flex-col" style={{ display: activeTab === 'diary' ? 'flex' : 'none' }}>
            <DiaryTab />
          </div>
          <div className="flex-1 flex-col" style={{ display: activeTab === 'tests' ? 'flex' : 'none' }}>
            <TestsTab request={requestFor('tests')} />
          </div>
          <div className="flex-1 flex-col" style={{ display: activeTab === 'reports' ? 'flex' : 'none' }}>
            <ReportsTab request={requestFor('reports')} active={activeTab === 'reports'} />
          </div>
          <div className="flex-1 flex-col" style={{ display: activeTab === 'profile' ? 'flex' : 'none' }}>
            <ProfileTab request={requestFor('profile')} active={activeTab === 'profile'} />
          </div>
          </>}
        </main>

        {!isNavHidden && (
          <nav aria-label="Главное меню" className="fixed bottom-0 left-0 w-full bg-rose-900 border-t border-[var(--ui-text)]/10 p-2 pb-safe z-50">
            <div className="flex max-w-2xl mx-auto gap-1">
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => selectTab(tab.id)}
                  className={`clay-navigation__item flex-1 flex flex-col items-center justify-center py-2 transition-all duration-300 ${
                    isActive ? 'text-[var(--ui-text)]' : 'text-[var(--ui-muted)] hover:text-[var(--ui-secondary)]'
                  }`}
                >
                  <img src={tab.icon} className="clay-navigation__icon" width="32" height="32" alt="" draggable="false" />
                  <span className={`text-[11px] leading-4 mt-1 ${isActive ? 'font-bold' : ''}`}>{tab.label}</span>
                </button>
              );
            })}
            </div>
          </nav>
        )}

        {isBillingOpen && profile && <BillingPage onBack={() => setIsBillingOpen(false)} />}
      </div>
    </AppNavContext.Provider>
  );
}
