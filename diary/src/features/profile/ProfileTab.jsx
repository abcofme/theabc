import React, { useState, useEffect } from 'react';
import { UserCircle, ClipboardList, CheckCircle2, CircleDashed } from 'lucide-react';

export default function ProfileTab() {
  // Состояние для хранения данных пользователя из Telegram
  const [tgUser, setTgUser] = useState(null);

  // Имитация базы данных (пока не подключен сервер на FastAPI)
  const [tests, setTests] = useState([
    { id: 1, title: 'Уровень тревожности (Шкала Бека)', result: 'Низкий уровень (12 баллов)' },
    { id: 2, title: 'Опросник депрессии', result: 'Норма (4 балла)' },
    { id: 3, title: 'Эмоциональное выгорание', result: null }, // null означает, что результат нет
    { id: 4, title: 'Тип привязанности', result: null },
  ]);

  useEffect(() => {
    // Пытаемся получить объект WebApp из Telegram
    const webApp = window.Telegram?.WebApp;
    
    // Если приложение открыто внутри Telegram, достаем юзера
    if (webApp && webApp.initDataUnsafe?.user) {
      setTgUser(webApp.initDataUnsafe.user);
    } else {
      // Если мы открыли сайт просто в браузере (как сейчас на localhost), 
      // ставим заглушку, чтобы было удобно верстать
      setTgUser({
        first_name: 'Разработчик',
        last_name: 'Проекта',
        username: 'dev_azbuka',
        photo_url: '' // Пустая строка покажет стандартную иконку
      });
    }
  }, []);

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      
      {/* ПРОФИЛЬ (Аватарка и Данные) */}
      <div className="flex flex-col items-center mt-6 mb-8">
        <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-emerald-500/50 bg-neutral-900 flex items-center justify-center mb-4 shadow-lg shadow-emerald-900/20">
          {tgUser?.photo_url ? (
            <img src={tgUser.photo_url} alt="Аватар" className="w-full h-full object-cover" />
          ) : (
            <UserCircle size={64} className="text-neutral-500" />
          )}
        </div>
        
        <h2 className="text-2xl font-bold text-neutral-100">
          {tgUser ? `${tgUser.first_name} ${tgUser.last_name || ''}`.trim() : 'Загрузка...'}
        </h2>
        
        {tgUser?.username && (
          <p className="text-emerald-400 font-medium mt-1">
            @{tgUser.username}
          </p>
        )}
      </div>

      {/* СПИСОК ТЕСТОВ ИЗ БОТА */}
      <div className="flex-1 bg-neutral-900/40 border border-neutral-800/80 rounded-3xl p-4 backdrop-blur-sm overflow-y-auto mb-2">
        <h3 className="text-lg font-bold text-neutral-300 mb-5 flex items-center gap-2">
          <ClipboardList size={20} className="text-emerald-500" />
          Результаты тестов
        </h3>

        <div className="space-y-3 pb-4">
          {tests.map(test => (
            <div key={test.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 transition-colors hover:border-neutral-700">
              <h4 className="text-base font-semibold text-neutral-200 mb-3">
                {test.title}
              </h4>
              
              {test.result ? (
                // Дизайн пройденного теста
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium bg-emerald-500/10 w-fit px-3 py-1.5 rounded-xl">
                  <CheckCircle2 size={18} />
                  <span>{test.result}</span>
                </div>
              ) : (
                // Дизайн не пройденного теста
                <div className="flex items-center gap-2 text-neutral-500 text-sm font-medium bg-neutral-800/50 w-fit px-3 py-1.5 rounded-xl">
                  <CircleDashed size={18} />
                  <span>Тест еще не пройден</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}