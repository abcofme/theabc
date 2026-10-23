const keyFor = (owner, key) => `diary_draft_${owner}_${key}`;

export function readDraft(owner, key, initial) {
  const fallback = { event: initial?.event || '', reaction: initial?.reaction || '', step: 'event' };
  if (!key) return fallback;
  try {
    const saved = JSON.parse(localStorage.getItem(keyFor(owner, key)));
    if (typeof saved?.event !== 'string' || typeof saved?.reaction !== 'string') return fallback;
    return { event: saved.event, reaction: saved.reaction, step: saved.step === 'reaction' && saved.event.trim() ? 'reaction' : 'event' };
  } catch {
    return fallback;
  }
}

export function saveDraft(owner, key, draft) {
  if (!key) return false;
  try {
    if (!draft.event && !draft.reaction) localStorage.removeItem(keyFor(owner, key));
    else localStorage.setItem(keyFor(owner, key), JSON.stringify(draft));
    return true;
  } catch {
    // Дневник остается доступным, если хранилище устройства заполнено или запрещено.
    return false;
  }
}

export function clearDraft(owner, key) {
  if (!key) return;
  try { localStorage.removeItem(keyFor(owner, key)); } catch { /* Хранилище может быть недоступно. */ }
}
