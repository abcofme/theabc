import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesLevel, groupLock, newEntriesStart, reportExcerpt } from '../src/features/reports/reportHelpers.js';

test('Превью отчета — первый абзац без заголовков, разметки и блоков кода', () => {
  const content = '# Повторяющиеся события\n\n```json\n{"a": 1}\n```\n\n## Главный паттерн\n\nЧаще всего записи касаются **рабочих встреч**, где ты *сдерживаешься*.\n\nВторой абзац.';
  assert.equal(reportExcerpt(content), 'Чаще всего записи касаются рабочих встреч, где ты сдерживаешься.');
  assert.equal(reportExcerpt('- **Работа.** Встречи\n- Семья'), 'Работа. Встречи Семья');
  assert.equal(reportExcerpt(''), '');
  const long = reportExcerpt('слово '.repeat(100), 40);
  assert.ok(long.length <= 41 && long.endsWith('…') && !long.includes('  '));
});

test('Новые записи считаются со следующего дня после отчета', () => {
  assert.equal(newEntriesStart('2026-10-22T09:00:00'), '2026-10-23');
  assert.equal(newEntriesStart('2026-10-31T23:59:00'), '2026-11-01');
  assert.equal(newEntriesStart('2026-12-31'), '2027-01-01');
});

test('Шкала полноты отчета растет с числом записей', () => {
  assert.deepEqual([0, 1, 4, 5, 14, 15, 29, 30, 200].map(entriesLevel), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
  assert.equal(entriesLevel(null), 0);
});

test('Отчеты по дневнику ждут портрет, профориентация — свои тесты', () => {
  const career = (passed) => [{ name: 'Профориентация', tests: [{ id: 1, passed }] }];
  const base = { total_tests: 6, passed_tests: 4, portrait: null, categories: career(false) };
  assert.equal(groupLock('general', base).target.tab, 'tests');
  assert.deepEqual(groupLock('general', { ...base, passed_tests: 6 }).target, { tab: 'profile', page: 'portrait' });
  assert.equal(groupLock('general', { ...base, portrait: { content: '' } }), null);
  assert.equal(groupLock('career', base).label, 'Нужны тесты профориентации · 0\u00a0из\u00a01');
  assert.equal(groupLock('career', { ...base, categories: career(true) }), null);
  assert.equal(groupLock('career', { ...base, categories: [] }).label, 'Нужны тесты профориентации');
  assert.equal(groupLock('general', null), null);
});
