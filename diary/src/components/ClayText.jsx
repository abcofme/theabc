import sheetUrl from '../assets/clay-font/glyphs.webp';
import font from '../assets/clay-font/glyphs.json';
import './clay-text.css';

// Пластилиновые буквы из спрайта: заглавные и строчные кириллицы.
// Остальные символы (цифры, знаки) выводятся обычным текстом в том же цвете.
const { height: H, ascent, sheet, glyphs } = font;
const sheetStyle = {
  '--clay-sheet': `url(${sheetUrl})`,
  '--clay-sheet-w': sheet[0] / H,
  '--clay-sheet-h': sheet[1] / H,
  '--clay-descent': (H - ascent) / H,
};

function Glyph({ char }) {
  const glyph = glyphs[char];
  if (!glyph) return <span className="clay-text__fallback">{char}</span>;
  const [x, y, w] = glyph;
  return (
    <span
      className="clay-text__glyph"
      style={{ '--clay-x': x / H, '--clay-y': y / H, '--clay-w': w / H }}
    />
  );
}

export default function ClayText({ text, as: Tag = 'span', className = '', ...props }) {
  const words = String(text).split(/(\s+)/);
  return (
    <Tag className={`clay-text ${className}`.trim()} style={sheetStyle} {...props}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, i) => (/\s/.test(word)
          ? ' '
          : (
            <span key={i} className="clay-text__word">
              {Array.from(word, (char, j) => <Glyph key={j} char={char} />)}
            </span>
          )))}
      </span>
    </Tag>
  );
}
