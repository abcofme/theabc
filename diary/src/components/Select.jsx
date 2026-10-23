import { ChevronDown } from './ClayIcon';

export default function Select({ children, className = '', ...props }) {
  return <span className="ui-select">
    <select {...props} className={className}>{children}</select>
    <ChevronDown size={18} className="ui-select__arrow" />
  </span>;
}
