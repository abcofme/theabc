const legacyHeadings = new Set([
  'Зеркало', 'Мои предположения', 'Что можно дополнить',
  'Могу предложить попробовать', 'Что проверить после',
  'Личность', 'Устойчивые черты личности', 'Поведенческие паттерны',
  'Система ценностей', 'Внутренние барьеры', 'Сильные стороны', 'Зоны роста',
  'Главный паттерн', 'Как это связано с вашим Портретом', 'Краткий вывод',
  'Зоны эффективности', 'Что наполняет', 'Что истощает', 'Ваша настоящая сила',
]);
const legacyLabels = new Set(['Тип личности', 'Реакция на стресс', 'Принятие решений', 'Стиль продуктивности', 'Адаптация к изменениям', 'Поведение в конфликте']);
const testHeadings = new Set([
  'Уровень процессов возбуждения', 'Уровень процессов торможения',
  'Уровень подвижности нервных процессов', 'Уравновешенность по силе',
]);
const testTypes = new Set([
  'Холерик', 'Сангвиник', 'Флегматик', 'Меланхолик',
  'Природа', 'Техника', 'Человек', 'Знаковые системы', 'Художественные образы',
  'Демонстративный тип', 'Застревающий тип', 'Педантичный тип', 'Возбудимый тип',
  'Гипертимный тип', 'Дистимический тип', 'Тревожный тип', 'Экзальтированный тип',
  'Эмотивный тип', 'Циклотимный тип',
]);

// Сохраненные ответы могут содержать обычные строки вместо Markdown-заголовков.
// Меняем только известные названия разделов и явные отдельные жирные заголовки.
export function formatResultText(content, titles = [], { testResult = false } = {}) {
  let text = String(content ?? '').replace(/\r\n?/g, '\n').trim();
  const wrapped = /^```(?:markdown|md)\s*\n([\s\S]*?)\n```$/.exec(text);
  if (wrapped) text = wrapped[1];
  let fence = null;
  const formatted = text.split('\n').map(line => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      return line;
    }
    if (fence || /^\s{4}/.test(line) || /^\s*#/.test(line)) return line;
    if (testResult) {
      // Старые тесты хранят заголовки шкал с «•», а тип — первым предложением.
      const plain = line.trim().replace(/^[•●-]\s+/, '');
      if (testHeadings.has(plain.replace(/:$/, ''))) return `\n## ${plain.replace(/:$/, '')}\n`;
      const typed = /^([^.!?]+)\.\s+(.+)$/.exec(plain);
      if (typed && testTypes.has(typed[1])) return `\n## ${typed[1]}\n\n${typed[2]}\n`;
    }
    const labeled = /^(?:\d+[.)]\s+)?(?:\*\*(.+?)\*\*\s*[:—–-]?\s+|([^:*]+?)\s*[:—–-]\s+)(.+)$/.exec(line.trim());
    if (labeled) {
      const name = (labeled[1] || labeled[2]).replace(/:$/, '');
      if (legacyHeadings.has(name)) return `\n## ${name}\n\n${labeled[3]}\n`;
      if (legacyLabels.has(name)) return `\n**${name}:** ${labeled[3]}\n`;
    }
    const plain = line.trim().replace(/^\d+[.)]\s+/, '').replace(/:$/, '');
    const bold = /^\*\*(.+?)\*\*:?$/.exec(plain);
    const title = bold?.[1].replace(/:$/, '') || plain;
    if (legacyHeadings.has(title) || (bold && title.length <= 100)) return `\n## ${title}\n`;
    return line.replace(/^(\s*)[•●]\s+/, '$1- ').replace(/^(\s*\d+)\)\s+/, '$1. ');
  }).join('\n');
  const firstHeading = /^\s*#{1,2}\s+(.+?)\s*\n/.exec(formatted);
  if (firstHeading && titles.some(title => title?.trim().toLocaleLowerCase('ru') === firstHeading[1].trim().toLocaleLowerCase('ru'))) {
    return formatted.slice(firstHeading[0].length).trim();
  }
  return formatted;
}

// «**Реакция на стресс** — пояснение» становится заметным подписанным абзацем.
// Внутритекстовые выделения и обычные абзацы остаются на своих местах.
export function remarkResultLabels({ blocks = false } = {}) {
  return function transform(tree) {
    const visit = node => {
      if (node.type === 'paragraph') {
        const [label, body] = node.children || [];
        const title = label?.type === 'strong' && label.children?.every(child => child.type === 'text')
          ? label.children.map(child => child.value).join('') : '';
        if (title && title.length <= 100 && body?.type === 'text' &&
          (/^\s*[:—–-]\s+/.test(body.value) || /:$/.test(title))) {
          body.value = body.value.replace(/^\s*[:—–-]\s+/, '');
          node.data = { ...node.data, hProperties: { ...node.data?.hProperties, className: ['result-detail'] } };
          if (blocks) {
            body.value = body.value.trimStart();
            const children = node.children.slice(1);
            node.type = 'blockquote';
            node.data.hName = 'aside';
            node.children = [
              { type: 'heading', depth: 3, children: label.children, position: label.position || node.position },
              { type: 'paragraph', children, position: node.position },
            ];
          }
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

function addClass(node, className, properties = {}) {
  const previous = node.data?.hProperties || {};
  const classes = Array.isArray(previous.className) ? previous.className : previous.className ? [previous.className] : [];
  node.data = { ...node.data, hProperties: { ...previous, ...properties, className: [...classes, className] } };
}

// Группируем готовый Markdown в разделы, не меняя порядок и содержание анализа.
// Используем стандартные узлы MDAST с hName, чтобы сохранялись списки, ссылки и JSON шкал.
export function remarkResultLayout({ sections = false, wrapIntro = false } = {}) {
  return tree => {
    const visit = node => {
      if (node.type === 'list') {
        addClass(node, node.ordered ? 'result-steps' : 'result-points');
        if (node.ordered) node.children.forEach((item, index) => addClass(item, 'result-step', { 'data-step': String((node.start ?? 1) + index) }));
      }
      if (node.type === 'blockquote' && !node.data?.hName) addClass(node, 'result-quote');
      node.children?.forEach(visit);
    };
    visit(tree);
    if (!sections) return;
    let section = null;
    let count = 0;
    const result = [];
    for (const node of tree.children) {
      if (node.type === 'heading' && node.depth <= 2) {
        count += 1;
        const number = String(count).padStart(2, '0');
        addClass(node, 'result-heading', { 'data-section-number': number });
        section = { type: 'blockquote', data: { hName: 'section', hProperties: { className: ['result-section'] } }, children: [node] };
        result.push(section);
      } else if (section) section.children.push(node);
      else if (wrapIntro) {
        section = { type: 'blockquote', data: { hName: 'section', hProperties: { className: ['result-section', 'result-section--intro'] } }, children: [node] };
        result.push(section);
      } else result.push(node);
    }
    for (const item of result) {
      if (item.data?.hName === 'section') {
        const lead = item.children[item.children[0]?.type === 'heading' ? 1 : 0];
        if (lead?.type === 'paragraph') addClass(lead, 'result-lead');
      }
    }
    tree.children = result;
  };
}
