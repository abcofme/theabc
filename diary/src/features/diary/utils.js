import { format } from 'date-fns';

// Такую оценку бэкенд ставит, когда ИИ не делал разбор (см. NO_ANALYSIS_SCORE в backend/api/main.py)
export const NO_ANALYSIS_SCORE = -1;

// День записи — строка YYYY-MM-DD в часовом поясе пользователя: так же её хранит бэкенд
export const dayKey = (date) => format(date, 'yyyy-MM-dd');

// Идентификатор назначается при создании: дописывание старой записи не меняет ее место.
export const newestEntryFirst = (a, b) => b.id - a.id;

// plural(4, ['тест', 'теста', 'тестов']) → 'теста'
export function plural(n, [one, few, many]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

// Почему дневник не может ответить и куда вести пользователя (action: tests | billing). null — ответ доступен
export function analysisLock(profile) {
  if (!profile) return { text: null };
  if (!profile.portrait) {
    const left = Math.max(profile.total_tests - profile.passed_tests, 0);
    if (left > 0) {
      return {
        text: `Ответ дневника появится после портрета личности. Осталось ${left} ${plural(left, ['тест', 'теста', 'тестов'])}`,
        action: 'tests',
      };
    }
    return { text: 'Все тесты пройдены — сформируй портрет личности, и дневник начнет отвечать', action: 'portrait' };
  }
  if (profile.access_level !== 'Premium' && profile.balance < profile.prices.diary_answer) {
    return { text: 'Баланс закончился — пополни его или оформи Premium, и дневник снова будет отвечать', action: 'billing' };
  }
  return null;
}

// Что показать под записью вместо ответа дневника или вместе с ним
export function analysisState(entry, isPending, lock) {
  if (isPending) return 'pending';
  const score = entry.portrait_match_score;
  if (score === NO_ANALYSIS_SCORE) return 'ask';
  if (score !== null && score !== undefined) return 'done';
  return lock ? 'locked' : 'idle';
}

export function scoreColor(score) {
  if (score <= 25) return 'bg-[#A36E6B]';
  if (score <= 50) return 'bg-[#B88A4E]';
  if (score <= 75) return 'bg-[#D6AE68]';
  return 'bg-[#7BA887]';
}
