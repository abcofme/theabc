export const progressKey = testId => `test_progress_${testId}`;

export function readTestProgress(testId) {
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey(testId)));
    return { answers: Array.isArray(saved?.answers) ? saved.answers : [], index: Number.isInteger(saved?.index) && saved.index >= 0 ? saved.index : 0, total: Number.isInteger(saved?.total) ? saved.total : null };
  } catch { return { answers: [], index: 0, total: null }; }
}

export function saveTestProgress(testId, value) {
  try { localStorage.setItem(progressKey(testId), JSON.stringify(value)); } catch { /* Продолжение доступно в текущей сессии. */ }
  window.dispatchEvent(new Event('test-progress:changed'));
}

export function clearTestProgress(testId) {
  try { localStorage.removeItem(progressKey(testId)); } catch { /* Хранилище может быть недоступно. */ }
  window.dispatchEvent(new Event('test-progress:changed'));
}

export function resumeTestProgress(saved, total) {
  const pending = total > 0 && saved.total === total && saved.answers.length === total && saved.index === total - 1;
  const index = Math.min(saved.index, Math.max(total - 1, 0), saved.answers.length);
  return { index, answers: saved.answers.slice(0, pending ? total : index), pending };
}
