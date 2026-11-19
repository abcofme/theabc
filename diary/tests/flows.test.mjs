import test from 'node:test';
import assert from 'node:assert/strict';
import { readDraft, saveDraft, clearDraft, readTextDraft, saveTextDraft } from '../src/features/diary/drafts.js';
import { clearTestProgress, discardLegacyTestProgress, readTestProgress, resumeTestProgress, saveTestProgress } from '../src/features/tests/testProgress.js';
import { parseScales, scaleValue } from '../src/features/profile/portraitScales.js';
import { analysisLock, analysisState, newestEntryFirst } from '../src/features/diary/utils.js';
import { formatResultText, remarkResultLabels } from '../src/components/resultFormatting.js';

class MemoryStorage {
  entries = new Map();
  get length() { return this.entries.size; }
  key(index) { return [...this.entries.keys()][index] ?? null; }
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

test('Черновик дополнения хранится отдельно от записи и стирается пустым текстом', () => {
  saveTextDraft(7, 'addition:41', 'Потом позвонил брат');
  assert.equal(readTextDraft(7, 'addition:41'), 'Потом позвонил брат');
  assert.equal(readDraft(7, 'edit:41', { event: 'С сервера' }).event, 'С сервера');
  saveTextDraft(7, 'addition:41', '');
  assert.equal(readTextDraft(7, 'addition:41'), '');
});

test('Поврежденный черновик не подменяет сохраненную серверную запись', () => {
  storage.setItem('diary_draft_7_edit:41', '{bad json');
  assert.equal(readDraft(7, 'edit:41', { event: 'С сервера' }).event, 'С сервера');
  storage.setItem('diary_draft_7_edit:41', JSON.stringify({ event: 42, reaction: null }));
  assert.equal(readDraft(7, 'edit:41', { event: 'С сервера' }).event, 'С сервера');
});

test('После неудачной отправки результата восстанавливается полный набор ответов для повтора без добавления последнего', () => {
  const completed = { answers: [11, 22, 33], index: 2, total: 3 };
  saveTestProgress(7, 5, completed);
  const restored = resumeTestProgress(readTestProgress(7, 5), 3);
  assert.deepEqual(restored, { answers: [11, 22, 33], index: 2, pending: true });
  // Повторная попытка получает тот же набор, а не [11,22,33,33].
  assert.deepEqual(resumeTestProgress(readTestProgress(7, 5), 3).answers, completed.answers);
  clearTestProgress(7, 5);
  assert.deepEqual(readTestProgress(7, 5).answers, []);
});

test('Обычное продолжение и изменение длины теста не пропускают вопросы', () => {
  assert.deepEqual(resumeTestProgress({ answers: [11, 22], index: 2, total: 40 }, 40), { answers: [11, 22], index: 2, pending: false });
  assert.deepEqual(resumeTestProgress({ answers: [11, 22, 33], index: 3, total: 40 }, 2), { answers: [11], index: 1, pending: false });
  assert.deepEqual(resumeTestProgress({ answers: [11], index: 20, total: 40 }, 40), { answers: [11], index: 1, pending: false });
  assert.deepEqual(resumeTestProgress({ answers: [], index: 0, total: 0 }, 0), { answers: [], index: 0, pending: false });
});

test('Поврежденный прогресс теста безопасно сбрасывается', () => {
  storage.setItem('test_progress_7_9', 'broken');
  assert.deepEqual(readTestProgress(7, 9), { answers: [], index: 0, total: null });
  storage.setItem('test_progress_7_9', JSON.stringify({ index: -1, answers: 'wrong' }));
  assert.deepEqual(readTestProgress(7, 9), { answers: [], index: 0, total: null });
});

test('Ответы из другой учётной записи и старый черновик без владельца не восстанавливаются', () => {
  const progress = { answers: [10], index: 1, total: 3 };
  storage.setItem('test_progress_19', JSON.stringify(progress));
  saveTestProgress(7, 19, progress);
  assert.deepEqual(readTestProgress(7, 19), progress);
  assert.deepEqual(readTestProgress(8, 19).answers, []);
  assert.deepEqual(readTestProgress(null, 19).answers, []);
  discardLegacyTestProgress();
  assert.equal(storage.getItem('test_progress_19'), null);
  assert.deepEqual(readTestProgress(7, 19), progress);
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

test('Новая запись остается первой после сохранения, повторной загрузки и редактирования старой', () => {
  const entries = [{ id: 31, event: 'Старая' }, { id: 7, event: 'Дополненная старая' }, { id: 42, event: 'Новая' }];
  assert.deepEqual([...entries].sort(newestEntryFirst).map(entry => entry.id), [42, 31, 7]);
  assert.deepEqual([entries[2], entries[1], entries[0]].sort(newestEntryFirst).map(entry => entry.id), [42, 31, 7]);
});

test('Дневник отвечает после первого результата в любой категории и показывает сохранённые ответы', () => {
  const profile = { balance: 47, prices: { diary_answer: 47 }, passed_tests: 0, portrait: null };
  const withoutResults = {
    ...profile,
    categories: [
      { name: 'Темперамент', tests: [{ id: 1, passed: false }] },
      { name: 'Профориентация', has_test_result: false, tests: [{ id: 3, passed: true }] },
      { name: 'Пустая категория', tests: [] },
    ],
  };
  const lock = analysisLock({ ...withoutResults, portrait: { content: 'Сохранённый портрет' } });
  assert.equal(lock.action, 'tests');
  assert.match(lock.text, /любой тест/);
  assert.equal(analysisState({ portrait_match_score: 0 }, false, lock), 'done');
  const ready = {
    ...withoutResults,
    categories: withoutResults.categories.map(category => category.name === 'Профориентация'
      ? { ...category, has_test_result: true }
      : category),
  };
  assert.equal(analysisLock(ready), null);
  assert.equal(analysisLock({ ...ready, balance: 0 }).action, 'billing');
  assert.equal(analysisLock({ ...ready, balance: 0, access_level: 'Premium' }), null);
});

test('Сохраненный ответ получает заголовки и списки, текст и JSON шкал не теряются', () => {
  const json = '```json\n[{"description":"Зеркало","leftValue":0,"rightValue":100}]\n```';
  const input = `Зеркало\nТы заметил усталость.\n\n**Мои предположения**\nВозможно, нужна пауза.\n\nМогу предложить попробовать:\n• Сделать паузу\n• Вернуться к разговору\n\n${json}`;
  const result = formatResultText(input);
  assert.match(result, /## Зеркало\n\nТы заметил усталость\./);
  assert.match(result, /## Мои предположения\n\nВозможно, нужна пауза\./);
  assert.match(result, /## Могу предложить попробовать\n\n- Сделать паузу\n- Вернуться к разговору/);
  assert.ok(result.endsWith(json));
  assert.equal(formatResultText('В тексте слово Зеркало остается на месте.'), 'В тексте слово Зеркало остается на месте.');
  assert.equal(formatResultText('```markdown\n## Раздел\n\nТекст\n```'), '## Раздел\n\nТекст');
  assert.equal(formatResultText('````text\n```\nЗеркало\n````'), '````text\n```\nЗеркало\n````');
  assert.equal(formatResultText('# Мой портрет личности\n\n## Черты\n\nТекст', ['Мой портрет личности']), '## Черты\n\nТекст');
  assert.equal(formatResultText('# Личность\n\nТекст', ['Портрет личности']), '# Личность\n\nТекст');
});

test('Отдельная жирная подпись оформляется блоком, внутритекстовые выделения остаются в абзаце', () => {
  const labeled = { type: 'paragraph', children: [{ type: 'strong', children: [{ type: 'text', value: 'Реакция на стресс' }] }, { type: 'text', value: ' — Ты ищешь время обдумать решение.' }] };
  const inline = { type: 'paragraph', children: [{ type: 'text', value: 'Твоя ' }, { type: 'strong', children: [{ type: 'text', value: 'опора' }] }, { type: 'text', value: ' — опыт.' }] };
  remarkResultLabels()({ type: 'root', children: [labeled, inline] });
  assert.deepEqual(labeled.data.hProperties.className, ['result-detail']);
  assert.equal(labeled.children[1].value, 'Ты ищешь время обдумать решение.');
  assert.equal(inline.data, undefined);
  assert.equal(inline.children[2].value, ' — опыт.');
});
