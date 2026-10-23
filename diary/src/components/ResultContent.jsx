import { useId } from 'react';
import ReactMarkdown from 'react-markdown';

function headingsOf(content) {
  let fence = null;
  return content.split('\n').flatMap((line, index) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
      return [];
    }
    if (fence) return [];
    const match = /^(#{1,3})\s+(.+?)(?:\s+#+)?$/.exec(line);
    return match ? [{ line: index + 1, text: match[2].replace(/[*_`]/g, '') }] : [];
  });
}

export default function ResultContent({ content = '', components = {}, contents = true }) {
  const prefix = useId();
  const headings = headingsOf(content);
  const heading = (Tag) => function Heading({ node, children }) {
    return <Tag id={`${prefix}-${node.position.start.line}`}>{children}</Tag>;
  };
  return (
    <>
      {contents && headings.length > 2 && (
        <details className="result-toc">
          <summary>Разделы материала</summary>
          <nav aria-label="Содержание">
            {headings.map(item => (
              <button key={item.line} type="button" onClick={() => {
                document.getElementById(`${prefix}-${item.line}`)?.scrollIntoView({ block: 'start', behavior: 'auto' });
              }}>{item.text}</button>
            ))}
          </nav>
        </details>
      )}
      <div className="result-content">
        <ReactMarkdown components={{ h1: heading('h1'), h2: heading('h2'), h3: heading('h3'), ...components }}>{content}</ReactMarkdown>
      </div>
    </>
  );
}
