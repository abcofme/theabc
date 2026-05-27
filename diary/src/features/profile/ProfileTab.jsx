import React, { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';

export default function ProfileTab() {
  const [categories, setCategories] = useState([]);
  
  // Получаем данные пользователя напрямую из Telegram
  const user = WebApp.initDataUnsafe?.user;

  useEffect(() => {
    if (WebApp.initData) {
      // Запрашиваем прогресс тестов из нашей общей базы
      // ВАЖНО: Замените IP_ВАШЕГО_СЕРВЕРА на реальный IP
      fetch("http://89.19.216.208:8000/api/profile", {
        headers: {
          "Authorization": `Bearer ${WebApp.initData}`
        }
      })
      .then(res => res.json())
      .then(data => setCategories(data.categories))
      .catch(err => console.error("Ошибка загрузки профиля:", err));
    }
  }, []);

  return (
    <div className="p-4">
      {/* 1. Блок пользователя: Аватарка и Юзернейм */}
      <div className="flex items-center gap-4 mb-6 p-4 bg-white rounded-xl shadow">
        {user?.photo_url ? (
          <img src={user.photo_url} alt="Avatar" className="w-16 h-16 rounded-full" />
        ) : (
          <div className="w-16 h-16 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center font-bold text-xl">
            {user?.first_name?.[0] || '?'}
          </div>
        )}
        <div>
          <h2 className="text-xl font-bold">{user?.first_name}</h2>
          <p className="text-gray-500">@{user?.username}</p>
        </div>
      </div>

      {/* 2. Список категорий и тестов */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold">Мои тесты</h3>
        {categories.map(cat => (
          <div key={cat.id} className="border rounded-lg p-3 bg-white">
            <h4 className="font-semibold mb-2">{cat.name}</h4>
            <div className="space-y-2">
              {cat.tests.map(test => (
                <div key={test.id} className="flex justify-between items-center text-sm border-b pb-1 cursor-pointer">
                  <span>{test.name}</span>
                  {test.passed ? (
                    <span className="text-green-500 font-medium">Пройден</span>
                  ) : (
                    <span className="text-red-500 font-medium">Не пройден</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}