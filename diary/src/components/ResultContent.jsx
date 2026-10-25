import { useId, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ClayText from './ClayText';
import ClayLeaf from './ClayLeaf';
import { formatResultText, remarkTestProse, remarkResultLabels, remarkResultLayout } from './resultFormatting';

function headingsOf(content) {
  let fence = null;
  return content.split('\n').flatMap((line, index) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      return [];
    }
    if (fence) return [];
    const match = /^(#{1,3})\s+(.+?)(?:\s+#+)?$/.exec(line);
    return match ? [{ line: index + 1, depth: match[1].length, text: match[2].replace(/[*_`]/g, '') }] : [];
  });
}

function nodeText(node) {
  return node.type === 'text' ? node.value : node.children?.map(nodeText).join('') || '';
}

const noComponents = {};

export default function ResultContent({ content = '', components = noComponents, contents = true, compact = false, titles = [], variant = 'plain', clayHeadings = false, testResult = false }) {
  const prefix = useId();
  const formatted = variant === 'entry' ? String(content ?? '') : formatResultText(content, titles, { testResult });
  const rich = variant === 'document' || variant === 'reply';
  const botanical = variant === 'document';
  // Текст разбирается и компоненты создаются один раз на содержимое: новые компоненты на каждой перерисовке
  // заставляли React пересобирать весь документ — на портрете это тысячи элементов
  const markdown = useMemo(() => {
    const heading = (Tag) => function Heading({ node, children, className }) {
      const generatedId = useId();
      const number = node.properties?.['data-section-number'] ?? node.properties?.dataSectionNumber;
      const text = nodeText(node);
      const type = testResult && number && /^(.+?)\s+\(([^()]+)\)$/.exec(text);
      return <Tag id={node.position ? `${prefix}-${node.position.start.line}` : generatedId} className={`result-heading ${className || ''}`}>
        {number && (botanical ? <ClayLeaf index={Number(number) - 1} className="result-heading__leaf" /> : <span className="result-section-number" aria-hidden="true">{number}</span>)}
        {clayHeadings ? (type ? <span className="result-heading__body"><ClayText text={type[1]} /><span className="result-heading__subtitle">({type[2]})</span></span> : <ClayText text={text} />) : <span className="result-heading__text">{children}</span>}
      </Tag>;
    };
    return <ReactMarkdown remarkPlugins={[remarkGfm, ...(testResult ? [remarkTestProse] : []), [remarkResultLabels, { blocks: rich }], ...(rich ? [[remarkResultLayout, { sections: true, wrapIntro: botanical }]] : [])]} components={{
      h1: heading('h1'), h2: heading('h2'), h3: heading('h3'), h4: heading('h4'), h5: heading('h5'), h6: heading('h6'),
      section: ({ children, className = '' }) => <section className={className}>
        {botanical && className.split(' ').includes('result-section--intro') && <ClayLeaf className="result-intro-leaf" />}
        {children}
      </section>,
      li: ({ node, children, className }) => {
        const step = node.properties?.['data-step'] ?? node.properties?.dataStep;
        return <li className={className} data-step={step}>
          {step && <span className="result-step__number" aria-hidden="true">{step}</span>}
          {children}
        </li>;
      },
      table: ({ children }) => <div className="result-table" role="region" aria-label="Таблица" tabIndex={0}><table>{children}</table></div>,
      ...components,
    }}>{formatted}</ReactMarkdown>;
  }, [formatted, prefix, rich, botanical, clayHeadings, testResult, components]);
  const allHeadings = headingsOf(formatted);
  const mainHeadings = allHeadings.filter(item => item.depth <= 2);
  const headings = rich && mainHeadings.length > 1 ? mainHeadings : allHeadings;
  return (
    <div className={`result-reader result-reader--${variant}${clayHeadings ? ' result-reader--clay' : ''}`}>
      {contents && headings.length > 2 && (
        <details className="result-toc ui-disclosure">
          <summary>Содержание</summary>
          <nav aria-label="Содержание">
            {headings.map(item => (
              <button key={item.line} type="button" onClick={() => {
                document.getElementById(`${prefix}-${item.line}`)?.scrollIntoView({ block: 'start', behavior: 'auto' });
              }}><span>{item.text}</span></button>
            ))}
          </nav>
        </details>
      )}
      <div className={`result-content${compact ? ' result-content--compact' : ''}`}>{markdown}</div>
    </div>
  );
}
