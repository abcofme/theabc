import sheetUrl from '../assets/clay-font/glyphs.webp';
import font from '../assets/clay-font/glyphs.json';
import symbolsUrl from '../assets/clay-font/symbols.webp';
import symbols from '../assets/clay-font/symbols.json';
import './clay-text.css';

// Оба спрайта используют общую высоту клетки и базовую линию.
const { height: H, ascent, sheet, glyphs } = font;

function spriteStyle(url, [width, height]) {
  return {
    '--clay-sheet': `url(${url})`,
    '--clay-sheet-w': width / H,
    '--clay-sheet-h': height / H,
  };
}

const sheetStyle = { ...spriteStyle(sheetUrl, sheet), '--clay-descent': (H - ascent) / H };
const symbolStyle = spriteStyle(symbolsUrl, symbols.sheet);

function Glyph({ char }) {
  const symbol = symbols.glyphs[char];
  const glyph = symbol ?? glyphs[char];
  if (!glyph) return <span className="clay-text__fallback">{char}</span>;
  const [x, y, w] = glyph;
  return (
    <span
      className="clay-text__glyph"
      style={{ ...(symbol && symbolStyle), '--clay-x': x / H, '--clay-y': y / H, '--clay-w': w / H }}
    />
  );
}

export default function ClayText({ text, as: Tag = 'span', className = '', ...props }) {
  const words = String(text).split(/(\s+)/).flatMap(word => /\s/.test(word) ? word : word.match(/[^-]+-?|-/g) || []);
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
