import { addDays, format, parseISO } from 'date-fns';
import { analysisTestProgress } from '../../context/profile.js';

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

// Почему новый отчёт пока недоступен и куда вести пользователя. null — доступен.
export function reportLock(profile) {
  if (!profile) return null;
  const { covered, total } = analysisTestProgress(profile);
  if (total === 0 || covered < total) {
    return {
      label: 'Нужны результаты тестов',
      text: 'Пройди хотя бы по одному тесту в каждой категории, чтобы сформировать отчёт.',
      action: 'К тестам',
      target: { tab: 'tests' },
    };
  }
  return null;
}
