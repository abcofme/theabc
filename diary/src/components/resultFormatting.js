const legacyHeadings = new Set([
  'Зеркало', 'Мои предположения', 'Что можно дополнить',
  'Могу предложить попробовать', 'Что проверить после',
  'Личность', 'Устойчивые черты личности', 'Поведенческие паттерны',
  'Система ценностей', 'Внутренние барьеры', 'Сильные стороны', 'Зоны роста',
  'Главный паттерн', 'Как это связано с вашим Портретом', 'Краткий вывод',
  'Зоны эффективности', 'Что наполняет', 'Что истощает', 'Ваша настоящая сила',
]);

// Сохраненные ответы могут содержать обычные строки вместо Markdown-заголовков.
// Меняем только известные названия разделов и явные отдельные жирные заголовки.
export function formatResultText(content, titles = []) {
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
    const plain = line.trim().replace(/^\d+[.)]\s+/, '').replace(/:$/, '');
    const bold = /^\*\*(.+?)\*\*:?$/.exec(plain);
    const title = bold?.[1].replace(/:$/, '') || plain;
    if (legacyHeadings.has(title) || (bold && title.length <= 100)) return `\n## ${title}\n`;
    return line.replace(/^(\s*)[•●]\s+/, '$1- ');
  }).join('\n');
  const firstHeading = /^\s*#{1,2}\s+(.+?)\s*\n/.exec(formatted);
  if (firstHeading && titles.some(title => title?.trim().toLocaleLowerCase('ru') === firstHeading[1].trim().toLocaleLowerCase('ru'))) {
    return formatted.slice(firstHeading[0].length).trim();
  }
  return formatted;
}

// «**Реакция на стресс** — пояснение» становится заметным подписанным абзацем.
// Внутритекстовые выделения и обычные абзацы остаются на своих местах.
export function remarkResultLabels() {
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
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
