import { createContext, useContext } from 'react';

export const ProfileContext = createContext({
  profile: null,
  profileError: null,
  refreshProfile: () => {},
  isPremium: false,
  generatePortrait: async () => {},
  isGeneratingPortrait: false,
});

// Статус пользователя (доступ, баланс, портрет, прогресс тестов), общий для всех вкладок
export const useProfile = () => useContext(ProfileContext);

// Для анализа важна каждая категория с тестами, включая профориентацию.
export function analysisTestProgress(profile) {
  const categories = (profile.categories ?? []).filter(category => category.tests.length > 0);
  const covered = categories.filter(category =>
    category.has_test_result ?? category.tests.some(test => test.passed)
  ).length;
  return { covered, total: categories.length };
}

// Где пользователь на пути к портрету личности: тесты → портрет → его обновление
export function portraitState(profile) {
  if (!profile) return null;
  const { passed_tests: passed, total_tests: total, portrait } = profile;
  const allPassed = total > 0 && passed >= total;
  if (!portrait) return allPassed ? 'ready' : 'tests';
  return allPassed && passed > portrait.tests_count ? 'outdated' : 'done';
}
