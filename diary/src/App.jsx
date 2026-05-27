import React, { useState } from 'react';
import { Calendar as CalendarIcon, Sparkles, User } from 'lucide-react';
import CalendarTab from './features/calendar/CalendarTab';
import ProfileTab from './features/profile/ProfileTab';

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
      <div className="flex items-center justify-center h-screen bg-neutral-950 text-center p-4">
        <div>
          <h2 className="text-2xl font-bold text-red-500 mb-2">Доступ запрещен</h2>
          <p className="text-neutral-400">Дневник можно открыть только через нашего Telegram-бота.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full font-sans bg-neutral-950">
      <main className={`flex-1 overflow-y-auto p-4 ${isNavHidden ? '' : 'pb-24'}`}>
        {/* Передаем функцию скрытия меню в CalendarTab */}
        {activeTab === 'diary' && <CalendarTab onSheetOpen={setIsNavHidden} />}
        {activeTab === 'ai' && (
          <div className="text-center mt-10 text-purple-400">
            <h1 className="text-2xl font-bold mb-2">ИИ Анализ</h1>
            <p className="text-purple-500/50">Coming soon. Следите за обновлениями!</p>
          </div>
        )}
        {activeTab === 'profile' && <ProfileTab />}
      </main>

      {/* Отрисовываем меню только если isNavHidden === false */}
      {!isNavHidden && (
        <nav className="fixed bottom-0 left-0 w-full bg-neutral-900 border-t border-neutral-800 flex justify-around p-3 pb-safe z-50">
          <button
            onClick={() => setActiveTab('diary')}
            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${
              activeTab === 'diary' ? 'text-blue-400' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <CalendarIcon size={24} />
            <span className="text-xs mt-1">Дневник</span>
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${
              activeTab === 'ai' ? 'text-purple-400' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <Sparkles size={24} />
            <span className="text-xs mt-1">ИИ Отчеты</span>
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${
              activeTab === 'profile' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <User size={24} />
            <span className="text-xs mt-1">Кабинет</span>
          </button>
        </nav>
      )}
    </div>
  );
}