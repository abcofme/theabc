import rusalovManifest from './rusalovIllustrations.json';
import manifest from './questionIllustrations.json';

const images = import.meta.glob('../../assets/tests/questions/**/*.webp', { eager: true, query: '?url', import: 'default' });
const normalize = value => (value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^а-яa-z0-9]/g, '');
const tests = [...manifest, {
  testName: 'Опросник структуры темперамента (ОСТ) В.М. Русалова',
  questions: rusalovManifest.map(entry => ({ ...entry, file: `rusalov/${entry.file}` })),
}];
const illustrations = new Map(tests.map(({ testName, questions }) => [
  normalize(testName), new Map(questions.map(({ question, file }) => [
    normalize(question), images[`../../assets/tests/questions/${file}`],
  ])),
]));

// Привязка к формулировке сохраняет сюжет при перестановке вопросов.
export function questionIllustration(test, question) {
  return illustrations.get(normalize(test?.name))?.get(normalize(question?.name));
}

export function testIllustrationSources(test) {
  return [...(illustrations.get(normalize(test?.name))?.values() || [])].filter(Boolean);
}
