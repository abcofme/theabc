const files = import.meta.glob('../assets/icons/*.webp', { eager: true, query: '?url', import: 'default' });

const variants = {
  ChevronDown: ['chevron-right', 'rotate(90deg)'],
  ChevronLeft: ['chevron-right', 'rotate(180deg)'],
  ChevronUp: ['chevron-right', 'rotate(-90deg)'],
  ArrowLeft: ['arrow-right', 'rotate(180deg)'],
  RotateCcw: ['refresh-cw', 'scaleX(-1)'],
  Calendar: ['calendar-days'],
  Edit: ['pen-line'],
};

// Единые растровые пластилиновые иконки; кнопка вокруг сохраняет область нажатия.
function ClayIcon({ name, size = 24, className = '', style, ...props }) {
  const [file, transform] = variants[name] || [name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()];
  const imageProps = { ...props };
  delete imageProps.strokeWidth;
  delete imageProps.absoluteStrokeWidth;
  delete imageProps.color;
  return <img
    className={`clay-icon ${className}`}
    src={files[`../assets/icons/${file}.webp`]}
    alt={props['aria-label'] || ''}
    aria-hidden={props['aria-label'] ? undefined : true}
    draggable="false"
    width={size}
    height={size}
    style={{ width: size, height: size, ...style, ...(transform ? { transform: [style?.transform, transform].filter(Boolean).join(' ') } : {}) }}
    {...imageProps}
  />;
}

export function Activity(props) { return <ClayIcon name="Activity" {...props} />; }
export function AlertTriangle(props) { return <ClayIcon name="AlertTriangle" {...props} />; }
export function ArrowLeft(props) { return <ClayIcon name="ArrowLeft" {...props} />; }
export function ArrowRight(props) { return <ClayIcon name="ArrowRight" {...props} />; }
export function Bell(props) { return <ClayIcon name="Bell" {...props} />; }
export function Brain(props) { return <ClayIcon name="Brain" {...props} />; }
export function Calendar(props) { return <ClayIcon name="Calendar" {...props} />; }
export function CalendarDays(props) { return <ClayIcon name="CalendarDays" {...props} />; }
export function Check(props) { return <ClayIcon name="Check" {...props} />; }
export function ChevronDown(props) { return <ClayIcon name="ChevronDown" {...props} />; }
export function ChevronLeft(props) { return <ClayIcon name="ChevronLeft" {...props} />; }
export function ChevronRight(props) { return <ClayIcon name="ChevronRight" {...props} />; }
export function ChevronUp(props) { return <ClayIcon name="ChevronUp" {...props} />; }
export function CircleAlert(props) { return <ClayIcon name="CircleAlert" {...props} />; }
export function Copy(props) { return <ClayIcon name="Copy" {...props} />; }
export function Download(props) { return <ClayIcon name="Download" {...props} />; }
export function Edit(props) { return <ClayIcon name="Edit" {...props} />; }
export function FileText(props) { return <ClayIcon name="FileText" {...props} />; }
export function Flame(props) { return <ClayIcon name="Flame" {...props} />; }
export function Heart(props) { return <ClayIcon name="Heart" {...props} />; }
export function Inbox(props) { return <ClayIcon name="Inbox" {...props} />; }
export function Leaf(props) { return <ClayIcon name="Leaf" {...props} />; }
export function Link2(props) { return <ClayIcon name="Link2" {...props} />; }
export function LoaderCircle(props) { return <ClayIcon name="LoaderCircle" {...props} />; }
export function Lock(props) { return <ClayIcon name="Lock" {...props} />; }
export function MessageCircle(props) { return <ClayIcon name="MessageCircle" {...props} />; }
export function PenLine(props) { return <ClayIcon name="PenLine" {...props} />; }
export function Plus(props) { return <ClayIcon name="Plus" {...props} />; }
export function RefreshCw(props) { return <ClayIcon name="RefreshCw" {...props} />; }
export function RotateCcw(props) { return <ClayIcon name="RotateCcw" {...props} />; }
export function Save(props) { return <ClayIcon name="Save" {...props} />; }
export function Send(props) { return <ClayIcon name="Send" {...props} />; }
export function Shield(props) { return <ClayIcon name="Shield" {...props} />; }
export function Sparkles(props) { return <ClayIcon name="Sparkles" {...props} />; }
export function Trash2(props) { return <ClayIcon name="Trash2" {...props} />; }
export function Undo2(props) { return <ClayIcon name="Undo2" {...props} />; }
export function User(props) { return <ClayIcon name="User" {...props} />; }
export function UserMinus(props) { return <ClayIcon name="UserMinus" {...props} />; }
export function UserPlus(props) { return <ClayIcon name="UserPlus" {...props} />; }
export function Users(props) { return <ClayIcon name="Users" {...props} />; }
export function Wallet(props) { return <ClayIcon name="Wallet" {...props} />; }
export function Wand2(props) { return <ClayIcon name="Wand2" {...props} />; }
export function X(props) { return <ClayIcon name="X" {...props} />; }
