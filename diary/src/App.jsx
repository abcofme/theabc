import React, { useState } from 'react';
import CalendarTab from './features/calendar/CalendarTab';
import ProfileTab from './features/profile/ProfileTab'; // <- Добавить эту строку
import { Calendar as CalendarIcon, Sparkles, User } from 'lucide-react';
import CalendarTab from './features/calendar/CalendarTab';

export default function App() {
  // Состояние текущей активной вкладки
  const [activeTab, setActiveTab] = useState('diary');

  return (
    <div className="flex flex-col h-full font-sans">
      
      {/* Основная рабочая область (экраны меняются в зависимости от activeTab) */}
      <main className="flex-1 overflow-y-auto p-4 pb-24">
        {activeTab === 'diary' && (
          <CalendarTab />
        )}
        
        {activeTab === 'ai' && (
          <div className="text-center mt-10 text-purple-400">
            <h1 className="text-2xl font-bold mb-2">ИИ Анализ</h1>
            <p className="text-purple-500/50">Здесь будут генерироваться отчеты нейросети</p>
          </div>
        )}
        
        {activeTab === 'profile' && (
          <div className="text-center mt-10 text-emerald-400">
            <h1 className="text-2xl font-bold mb-2">Личный кабинет</h1>
            <p className="text-emerald-500/50">Здесь будет ваша статистика тестов, которые Ваня Снюсов сделает в ближайшее время</p>
          </div>
        )}
      </main>

      {/* Ниже — фиксированная панель навигации */}
      <nav className="fixed bottom-0 left-0 w-full bg-neutral-900 border-t border-neutral-800 flex justify-around p-3 pb-safe">
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
      
    </div>
  );
}