import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesLevel, newEntriesStart, reportExcerpt, reportLock } from '../src/features/reports/reportHelpers.js';

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

test('У всех личных отчётов общий порог: по одному тесту из каждой непустой категории', () => {
  const profile = { total_tests: 2, passed_tests: 2, portrait: { content: 'Сохранённый портрет' } };
  const career = { name: 'Профориентация', tests: [{ id: 1, passed: true }] };
  const temperament = { name: 'Темперамент', tests: [{ id: 2, passed: true }, { id: 3, passed: false }] };
  const empty = { name: 'Пустая категория', tests: [] };
  const withCategories = (...categories) => ({ ...profile, categories });
  assert.deepEqual(reportLock(profile).target, { tab: 'tests' });
  assert.deepEqual(reportLock(withCategories(empty)).target, { tab: 'tests' });
  assert.match(reportLock(withCategories(temperament, { ...career, has_test_result: false })).text, /по одному тесту в каждой категории/);
  assert.match(reportLock(withCategories({ ...temperament, has_test_result: false }, career)).text, /по одному тесту в каждой категории/);
  assert.equal(reportLock(withCategories(temperament, career, empty)), null);
});
