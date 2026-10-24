import manifest from './rusalovIllustrations.json';

const images = import.meta.glob('../../assets/tests/questions/rusalov/*-neutral.webp', { eager: true, query: '?url', import: 'default' });
const normalize = value => (value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^а-яa-z0-9]/g, '');
const rusalov = new Map(manifest.map(({ question, file }) => [
  normalize(question), images[`../../assets/tests/questions/rusalov/${file}`],
]));

// Привязка к формулировке сохраняет сюжет при перестановке вопросов.
export function questionIllustration(test, question, theme) {
  if (theme !== 'temperament' || !normalize(test?.name).includes('русалов')) return undefined;
  return rusalov.get(normalize(question?.name));
}
