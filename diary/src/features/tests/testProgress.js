const progressKey = (ownerId, testId) => `test_progress_${ownerId}_${testId}`;

export function discardLegacyTestProgress() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (/^test_progress_\d+$/.test(key)) localStorage.removeItem(key);
    }
  } catch { /* Хранилище может быть недоступно. */ }
}

export function readTestProgress(ownerId, testId) {
  const empty = { answers: [], index: 0, total: null };
  if (ownerId == null) return empty;
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey(ownerId, testId)));
    return { answers: Array.isArray(saved?.answers) ? saved.answers : [], index: Number.isInteger(saved?.index) && saved.index >= 0 ? saved.index : 0, total: Number.isInteger(saved?.total) ? saved.total : null };
  } catch { return empty; }
}

export function saveTestProgress(ownerId, testId, value) {
  if (ownerId == null) return;
  try { localStorage.setItem(progressKey(ownerId, testId), JSON.stringify(value)); } catch { /* Продолжение доступно в текущей сессии. */ }
  window.dispatchEvent(new Event('test-progress:changed'));
}

export function clearTestProgress(ownerId, testId) {
  if (ownerId == null) return;
  try { localStorage.removeItem(progressKey(ownerId, testId)); } catch { /* Хранилище может быть недоступно. */ }
  window.dispatchEvent(new Event('test-progress:changed'));
}

export function resumeTestProgress(saved, total) {
  const pending = total > 0 && saved.total === total && saved.answers.length === total && saved.index === total - 1;
  const index = Math.min(saved.index, Math.max(total - 1, 0), saved.answers.length);
  return { index, answers: saved.answers.slice(0, pending ? total : index), pending };
}
