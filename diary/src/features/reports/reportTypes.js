import repeatingEventsImage from '../../assets/reports/repeating-events-handmade.webp';
import reactionsImage from '../../assets/reports/my-reactions-handmade.webp';
import energyImage from '../../assets/reports/energy-handmade.webp';
import competenceImage from '../../assets/reports/competence-handmade.webp';

export const REPORT_GROUPS = [
  {
    id: 'general',
    title: 'Поведенческий код',
    desc: 'По дневнику и портрету личности',
    items: [
      {
        id: 'repeating_events',
        title: 'Какие события чаще всего повторяются в моей жизни?',
        shortTitle: 'Повторяющиеся события',
        bannerTitle: 'Повторяющиеся\nсобытия',
        subtitle: 'Что снова и снова происходит в моей жизни',
        question: 'Какие события чаще всего повторяются в моей жизни?',
        image: repeatingEventsImage,
        matches: (title) => title.includes('Повторяющиеся'),
      },
      {
        id: 'effective_reactions',
        title: 'На какие ситуации я реагирую эффективно, а на какие нет?',
        shortTitle: 'Мои реакции',
        bannerTitle: 'Мои\nреакции',
        subtitle: 'Как мои реакции влияют на происходящее',
        question: 'На какие ситуации я реагирую эффективно, а на какие нет?',
        image: reactionsImage,
        matches: (title) => title.includes('эффективно'),
      },
    ],
  },
  {
    id: 'career',
    title: 'Профориентация',
    desc: 'По дневнику и тестам профориентации',
    items: [
      {
        id: 'energy',
        title: 'Энергия',
        shortTitle: 'Энергия',
        subtitle: 'Что наполняет меня, а что забирает силы',
        question: 'Что дает мне энергию, а что ее забирает?',
        image: energyImage,
        matches: (title) => title.includes('Энергия'),
      },
      {
        id: 'competence',
        title: 'Чувство компетентности',
        shortTitle: 'Чувство компетентности',
        bannerTitle: 'Чувство\nкомпетентности',
        subtitle: 'На какой опыт и сильные стороны я могу опереться',
        question: 'На какой опыт и сильные стороны я могу опереться?',
        image: competenceImage,
        matches: (title) => title.includes('компетентност'),
      },
    ],
  },
];

export const REPORT_TYPES = REPORT_GROUPS.flatMap(g => g.items.map(item => ({ ...item, group: g.id })));

export const reportTypeOf = (report) =>
  REPORT_TYPES.find(t => report.title === t.title || t.matches(report.title));

export const PERIODS = [
  ['week', 'Неделя'],
  ['month', 'Месяц'],
  ['3months', '3 месяца'],
  ['year', 'Год'],
  ['all', 'Все время'],
  ['custom', 'Свой период'],
];

export { FEW_ENTRIES } from './reportHelpers';

export const formatDay = (iso) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

// «12 сент. — 12 окт.» или «за все время»
export const periodLabel = (report) => (report.period_start
  ? `${formatDay(report.period_start)} — ${formatDay(report.period_end)}`
  : 'за все время');
