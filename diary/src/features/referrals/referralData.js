import { useEffect, useState } from 'react';
import { api } from '../../utils/api';

const integer = new Intl.NumberFormat('ru-RU');
const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const dates = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeZone: 'Europe/Moscow' });
const times = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' });
export const number = value => integer.format(value ?? 0);
export const rubles = value => money.format(value ?? 0);
export const kopecks = value => rubles((value ?? 0) / 100);
export const displayDate = (value, time = false) => {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? value : /Z$|[+-]\d{2}:\d{2}$/.test(value) ? value : value + 'Z');
  return (time ? times : dates).format(date);
};

export const LABELS = {
  premium: 'Подписка Premium',
  career: 'Доступ к профориентации',
  topup: 'Пополнение баланса',
  renewal: 'Продление Premium',
  diary_entry: 'Записи в дневнике',
  diary_answer: 'Разборы записей',
  portrait: 'Портреты личности',
  report: 'Отчёты по дневнику',
  repeating_events: 'Повторяющиеся события',
  effective_reactions: 'Мои реакции',
  energy: 'Энергия',
  competence: 'Чувство компетентности',
  other: 'Другие отчёты',
  compatibility: 'Отчёты о совместимости',
  compatibility_friendly: 'Дружеская совместимость',
  compatibility_partner: 'Партнёрская совместимость',
  test: 'Прохождения тестов',
  dictation: 'Успешные диктовки',
  app_open: 'Дни открытия приложения',
  friendship: 'Добавления в друзья',
  refund: 'Возврат токенов',
  bonus: 'Бонусные токены',
  demo: 'Стартовые токены',
};
export const STATUS = { pending: 'Ожидает перевода', paid: 'Выплачено', rejected: 'Отклонено' };

export function useReferralData(path) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const key = `${path}|${revision}`;

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    api(path).then(data => { if (!cancelled) setResult({ key, data }); })
      .catch(error => { if (!cancelled) setResult({ key, error }); });
    return () => { cancelled = true; };
  }, [path, key]);

  return {
    data: result?.key === key ? result.data : undefined,
    error: result?.key === key ? result.error : undefined,
    loading: Boolean(path && result?.key !== key),
    reload: () => setRevision(value => value + 1),
  };
}
