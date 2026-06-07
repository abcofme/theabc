import React, { useState } from 'react';
import { Calendar as CalendarIcon, Sparkles, User, Brain } from 'lucide-react';
import CalendarTab from './features/calendar/CalendarTab';
import ProfileTab from './features/profile/ProfileTab';
import ReportsTab from './features/reports/ReportsTab';

const WebApp = window.Telegram.WebApp;

export default function App() {
  const [activeTab, setActiveTab] = useState('diary');
  // Добавляем стейт для отслеживания открытого окна записей
  const [isNavHidden, setIsNavHidden] = useState(false);

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
    <div className="flex flex-col h-full font-sans bg-rose-950">
      <main className={`flex-1 overflow-y-auto p-4 ${isNavHidden ? '' : 'pb-24'}`}>
        {/* Передаем функцию скрытия меню в CalendarTab */}
        {activeTab === 'diary' && <CalendarTab onSheetOpen={setIsNavHidden} />}
        {activeTab === 'reports' && <ReportsTab />}
        {activeTab === 'profile' && <ProfileTab />}
      </main>

      {/* Отрисовываем меню только если isNavHidden === false */}
      {!isNavHidden && (
        <nav className="fixed bottom-0 left-0 w-full bg-rose-900 flex justify-between p-2 pb-safe z-50">
          <button
            onClick={() => setActiveTab('diary')}
            className={`flex-1 flex flex-col items-center justify-center py-2 transition-colors ${
              activeTab === 'diary' ? 'text-[#F5E6D3]' : 'text-[#F5E6D3] hover:text-[#F5E6D3]'
            }`}
          >
            <CalendarIcon size={24} />
            <span className="text-xs mt-1">Дневник</span>
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`flex-1 flex flex-col items-center justify-center py-2 transition-colors ${
              activeTab === 'reports' ? 'text-[#F5E6D3]' : 'text-[#F5E6D3] hover:text-[#F5E6D3]'
            }`}
          >
            <Brain size={24} />
            <span className="text-xs mt-1">Поведенческий код</span>
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 flex flex-col items-center justify-center py-2 transition-colors ${
              activeTab === 'profile' ? 'text-[#F5E6D3]' : 'text-[#F5E6D3] hover:text-[#F5E6D3]'
            }`}
          >
            <User size={24} />
            <span className="text-xs mt-1">Профиль</span>
          </button>
        </nav>
      )}
    </div>
  );
}