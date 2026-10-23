import { addDays, format, parseISO } from 'date-fns';

// Меньше записей — отчет получается неточным
export const FEW_ENTRIES = 5;

// Записи считаются новыми со следующего дня после отчета: день записи хранится без времени
export const newEntriesStart = (createdAt) => format(addDays(parseISO(String(createdAt).slice(0, 10)), 1), 'yyyy-MM-dd');

// Насколько полным будет отчет по числу записей: 0 — записей нет, 4 — их много
export function entriesLevel(count) {
  if (!count) return 0;
  if (count < FEW_ENTRIES) return 1;
  if (count < 15) return 2;
  if (count < 30) return 3;
  return 4;
}

// Первый абзац отчета без разметки — для превью
export function reportExcerpt(content = '', limit = 180) {
  const withoutCode = String(content).replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '');
  const paragraph = withoutCode.split(/\n\s*\n/).map(block => block.trim())
    .find(block => block && !/^(#|`{3,}|~{3,}|[-*_]{3,}$)/.test(block)) || '';
  const plain = paragraph
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > limit ? `${plain.slice(0, limit).replace(/\s+\S*$/, '')}…` : plain;
}

// Почему отчеты группы пока недоступны и куда вести пользователя. null — доступны.
// Отчеты по дневнику сверяются с портретом, отчеты профориентации — с ее тестами (так их строит бэкенд)
export function groupLock(groupId, profile) {
  if (!profile) return null;
  if (groupId === 'general' && !profile.portrait) {
    const left = Math.max((profile.total_tests || 0) - (profile.passed_tests || 0), 0);
    if (left === 0 && profile.total_tests > 0) {
      return {
        label: 'Нужен портрет личности',
        text: 'Эти отчеты сверяют записи с портретом личности. Все тесты пройдены — осталось сформировать портрет.',
        action: 'К портрету',
        target: { tab: 'profile', page: 'portrait' },
      };
    }
    return {
      label: 'Нужен портрет личности',
      text: 'Эти отчеты сверяют записи с портретом личности. Он складывается из тестов — пройди оставшиеся.',
      action: 'К тестам',
      target: { tab: 'tests' },
    };
  }
  if (groupId === 'career') {
    const tests = profile.categories?.find(c => c.name === 'Профориентация')?.tests || [];
    if (!tests.some(t => t.passed)) {
      return {
        label: tests.length ? `Нужны тесты профориентации · 0\u00a0из\u00a0${tests.length}` : 'Нужны тесты профориентации',
        text: 'Эти отчеты строятся по тестам профориентации — сначала пройди их.',
        action: 'К тестам профориентации',
        target: { tab: 'tests', category: 'Профориентация' },
      };
    }
  }
  return null;
}
