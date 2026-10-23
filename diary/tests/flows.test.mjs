import test from 'node:test';
import assert from 'node:assert/strict';
import { readDraft, saveDraft, clearDraft } from '../src/features/diary/drafts.js';
import { readTestProgress, resumeTestProgress, saveTestProgress, clearTestProgress } from '../src/features/tests/testProgress.js';
import { parseScales, scaleValue } from '../src/features/profile/portraitScales.js';

class MemoryStorage {
  entries = new Map();
  getItem(key) { return this.entries.get(key) ?? null; }
  setItem(key, value) { this.entries.set(key, value); }
  removeItem(key) { this.entries.delete(key); }
}
const storage = new MemoryStorage();
globalThis.localStorage = storage;
globalThis.window = { dispatchEvent() {} };

test('Закрытая запись восстанавливает оба текста и шаг, черновики разных дат и пользователей изолированы', () => {
  const draft = { event: 'Важное событие', reaction: 'Моя реакция', step: 'reaction' };
  assert.equal(saveDraft(7, 'new:2026-10-23', draft), true);
  assert.deepEqual(readDraft(7, 'new:2026-10-23'), draft);
  assert.equal(readDraft(8, 'new:2026-10-23').event, '');
  assert.equal(readDraft(7, 'new:2026-10-22').event, '');
  clearDraft(7, 'new:2026-10-23');
  assert.equal(readDraft(7, 'new:2026-10-23').event, '');
});

test('Пустое поле и недоступное хранилище не ломают ввод и не заявляют об успешном сохранении', () => {
  saveDraft(7, 'new:empty', { event: 'Текст', reaction: '', step: 'event' });
  saveDraft(7, 'new:empty', { event: '', reaction: '', step: 'event' });
  assert.equal(readDraft(7, 'new:empty').event, '');
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(saveDraft(7, 'new:blocked', { event: 'Текст', reaction: '', step: 'event' }), false);
  assert.deepEqual(readDraft(7, 'new:blocked', { event: 'Сохраненная запись', reaction: 'Реакция' }), { event: 'Сохраненная запись', reaction: 'Реакция', step: 'event' });
  assert.doesNotThrow(() => clearDraft(7, 'new:blocked'));
  globalThis.localStorage = storage;
});

test('Поврежденный черновик не подменяет сохраненную серверную запись', () => {
  storage.setItem('diary_draft_7_edit:41', '{bad json');
  assert.equal(readDraft(7, 'edit:41', { event: 'С сервера' }).event, 'С сервера');
  storage.setItem('diary_draft_7_edit:41', JSON.stringify({ event: 42, reaction: null }));
  assert.equal(readDraft(7, 'edit:41', { event: 'С сервера' }).event, 'С сервера');
});

test('После неудачной отправки результата восстанавливается полный набор ответов для повтора без добавления последнего', () => {
  const completed = { answers: [11, 22, 33], index: 2, total: 3 };
  saveTestProgress(5, completed);
  const restored = resumeTestProgress(readTestProgress(5), 3);
  assert.deepEqual(restored, { answers: [11, 22, 33], index: 2, pending: true });
  // Повторная попытка получает тот же набор, а не [11,22,33,33].
  assert.deepEqual(resumeTestProgress(readTestProgress(5), 3).answers, completed.answers);
  clearTestProgress(5);
  assert.deepEqual(readTestProgress(5).answers, []);
});

test('Обычное продолжение и изменение длины теста не пропускают вопросы', () => {
  assert.deepEqual(resumeTestProgress({ answers: [11, 22], index: 2, total: 40 }, 40), { answers: [11, 22], index: 2, pending: false });
  assert.deepEqual(resumeTestProgress({ answers: [11, 22, 33], index: 3, total: 40 }, 2), { answers: [11], index: 1, pending: false });
  assert.deepEqual(resumeTestProgress({ answers: [11], index: 20, total: 40 }, 40), { answers: [11], index: 1, pending: false });
  assert.deepEqual(resumeTestProgress({ answers: [], index: 0, total: 0 }, 0), { answers: [], index: 0, pending: false });
});

test('Поврежденный прогресс теста безопасно сбрасывается', () => {
  storage.setItem('test_progress_9', 'broken');
  assert.deepEqual(readTestProgress(9), { answers: [], index: 0, total: null });
  storage.setItem('test_progress_9', JSON.stringify({ index: -1, answers: 'wrong' }));
  assert.deepEqual(readTestProgress(9), { answers: [], index: 0, total: null });
});

test('Шкалы портрета сохраняют крайние значения и поддерживаемые форматы', () => {
  const scales = [{ left: 'А', right: 'Б', leftValue: 0, rightValue: 100, description: 'Полное пояснение' }];
  for (const data of [scales, { scales }, { data: scales }, { values: scales }]) assert.deepEqual(parseScales(JSON.stringify(data)), scales);
  assert.equal(scaleValue(0), 0);
  assert.equal(scaleValue(100), 100);
  assert.equal(scaleValue(null), 50);
  assert.equal(scaleValue('не число'), 50);
  assert.throws(() => parseScales('Не JSON'));
});
