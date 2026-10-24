import sustainedWork from '../../assets/tests/questions/rusalov/rusalov-546-sustained-work.webp';
import steadyPace from '../../assets/tests/questions/rusalov/rusalov-547-steady-pace.webp';
import persistence from '../../assets/tests/questions/rusalov/rusalov-548-persistence.webp';

const normalize = value => (value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^а-яa-z0-9]/g, '');
const rusalov = new Map([
  ['Вы легко и с удовольствием беретесь за длительную умственную или физическую работу?', sustainedWork],
  ['Вы способны долго работать, не снижая темпа и качества, даже если задача монотонна?', steadyPace],
  ['Вам нравится преодолевать трудности в работе, требующей усидчивости и напряжения?', persistence],
].map(([question, image]) => [normalize(question), image]));

// Привязка к формулировке сохраняет сюжет при перестановке вопросов.
export function questionIllustration(test, question, theme) {
  if (theme !== 'temperament' || !normalize(test?.name).includes('русалов')) return undefined;
  return rusalov.get(normalize(question?.name));
}
