import { format } from 'date-fns';

// Такую оценку бэкенд ставит, когда ИИ не делал разбор (см. NO_ANALYSIS_SCORE в backend/api/main.py)
export const NO_ANALYSIS_SCORE = -1;

// День записи — строка YYYY-MM-DD в часовом поясе пользователя: так же её хранит бэкенд
export const dayKey = (date) => format(date, 'yyyy-MM-dd');

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
    return { text: 'Все тесты пройдены — сформируй портрет личности, и дневник начнет отвечать', action: 'tests' };
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
  if (score <= 25) return 'bg-red-500';
  if (score <= 50) return 'bg-orange-500';
  if (score <= 75) return 'bg-yellow-400';
  return 'bg-emerald-800';
}
