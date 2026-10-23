import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatResultText, remarkResultLabels, remarkResultLayout } from '../src/components/resultFormatting.js';

const render = content => renderToStaticMarkup(createElement(ReactMarkdown, {
  remarkPlugins: [remarkGfm, [remarkResultLabels, { blocks: true }], [remarkResultLayout, { sections: true }]],
}, formatResultText(content)));

test('Разделы, пояснения и цитаты сохраняют исходный текст и вложенную разметку', () => {
  const html = render('## Главный паттерн\n\n**Главная мысль** и детали.\n\n**Наблюдение:** Текст с [ссылкой](https://example.com).\n\n> Дословная цитата\n\n## На что опереться\n\nВторой раздел.');
  assert.equal((html.match(/<section /g) || []).length, 2);
  assert.match(html, /data-section-number="01"/);
  assert.match(html, /data-section-number="02"/);
  assert.match(html, /class="result-lead"><strong>Главная мысль<\/strong> и детали\./);
  assert.match(html, /<aside class="result-detail">\s*<h3>Наблюдение:<\/h3>\s*<p>Текст с <a href="https:\/\/example.com">ссылкой<\/a>\.<\/p>\s*<\/aside>/);
  assert.match(html, /<blockquote class="result-quote">\s*<p>Дословная цитата<\/p>/);
  assert.match(html, /Второй раздел\./);
});

test('Нумерация действий учитывает начальный номер и вложенные списки', () => {
  const html = render('## Следующие шаги\n\n3. Первый шаг\n4. Второй шаг\n   - Подробность\n   - Еще подробность');
  assert.match(html, /<ol start="3" class="result-steps">/);
  assert.match(html, /data-step="3"/);
  assert.match(html, /data-step="4"/);
  assert.match(html, /<ul class="result-points">/);
  assert.match(html, /Подробность/);
  assert.match(html, /Еще подробность/);
});

test('Таблицы и чеклисты отображаются, JSON шкал остается неприкосновенным', () => {
  const json = '[{"left":"А","right":"Б","leftValue":0,"rightValue":100,"description":"Зеркало"}]';
  const html = render(`## Сравнение\n\n| Ситуация | Реакция |\n| --- | --- |\n| Раньше | Согласие |\n| Сейчас | Пауза |\n\n- [x] Выполнено\n- [ ] В планах\n\n## Черты\n\n\`\`\`json\n${json}\n\`\`\``);
  assert.match(html, /<table>/);
  assert.match(html, /<th>Ситуация<\/th>/);
  assert.match(html, /<td>Пауза<\/td>/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /checked=""/);
  assert.match(html, /class="language-json"/);
  assert.match(html, /&quot;leftValue&quot;:0,&quot;rightValue&quot;:100/);
  assert.equal((html.match(/data-section-number=/g) || []).length, 2);
});

test('Старые пронумерованные разделы отчета и подписи портрета становятся структурой, обычные шаги сохраняются', () => {
  const formatted = formatResultText('1. **Главный паттерн:** Ты берешь лишние задачи.\n\n2. **Краткий вывод**: Тебе помогает пауза.\n\nРеакция на стресс — Ты обдумываешь решение.\n\n1) Сделать паузу\n2) Ответить');
  assert.match(formatted, /## Главный паттерн\n\nТы берешь лишние задачи\./);
  assert.match(formatted, /## Краткий вывод\n\nТебе помогает пауза\./);
  assert.match(formatted, /\*\*Реакция на стресс:\*\* Ты обдумываешь решение\./);
  assert.match(formatted, /1\. Сделать паузу\n2\. Ответить/);
});

const renderTest = content => renderToStaticMarkup(createElement(ReactMarkdown, {
  remarkPlugins: [remarkGfm, [remarkResultLabels, { blocks: true }], [remarkResultLayout, { sections: true, wrapIntro: true }]],
}, formatResultText(content, [], { testResult: true })));

test('Шкалы Стреляу и типы Белова получают такие же разделы, как отчеты', () => {
  const html = renderTest('Ваша Формула темперамента = 40% Холерик + 60% Сангвиник\n\n• Холерик. Отличается повышенной возбудимостью.\n• Сангвиник. Быстро приспосабливается к новым условиям.\n\n• Уровень процессов возбуждения\nСильная ответная реакция на возбуждение.');
  assert.equal((html.match(/<section /g) || []).length, 4);
  assert.match(html, /class="result-section result-section--intro"/);
  assert.match(html, /Ваша Формула темперамента = 40% Холерик \+ 60% Сангвиник/);
  assert.match(html, /<h2[^>]*>Холерик<\/h2>/);
  assert.match(html, /<h2[^>]*>Сангвиник<\/h2>/);
  assert.match(html, /<h2[^>]*>Уровень процессов возбуждения<\/h2>/);
  assert.match(html, /class="result-lead">Сильная ответная реакция на возбуждение\./);
  assert.doesNotMatch(html, /<ul/);
});

test('Профориентация и акцентуации выделяют известный тип, сохраняя описание', () => {
  const html = renderTest('• Знаковые системы. Работа с текстами, документами и базами данных.\n\nЭмотивный тип. Характерны эмоциональность и чувствительность.');
  assert.equal((html.match(/<section /g) || []).length, 2);
  assert.match(html, />Знаковые системы<\/h2>/);
  assert.match(html, /Работа с текстами, документами и базами данных\./);
  assert.match(html, />Эмотивный тип<\/h2>/);
  assert.match(html, /Характерны эмоциональность и чувствительность\./);
});

test('Обычный результат без заголовков получает оформление документа без придуманного текста', () => {
  const text = 'Ты предпочитаешь спокойно обдумывать решения.\n\nТебе помогает время на отдых.';
  const html = renderTest(text);
  assert.equal((html.match(/<section /g) || []).length, 1);
  assert.match(html, /class="result-lead">Ты предпочитаешь спокойно обдумывать решения\./);
  assert.match(html, /<p>Тебе помогает время на отдых\.<\/p>/);
  assert.doesNotMatch(html, /<h[1-6]/);
  assert.equal(formatResultText(text, [], { testResult: true }), text);
  assert.equal((render(text).match(/<section /g) || []).length, 0);
});

test('Распознавание тестов не затрагивает обычные списки и блоки кода', () => {
  const text = '- Пример. Это обычный пункт.\n\n```text\n• Холерик. Исходный пример.\n```';
  const formatted = formatResultText(text, [], { testResult: true });
  assert.equal(formatted, text);
  assert.doesNotMatch(formatResultText('• Холерик. Описание.'), /##/);
});
