import { LoaderCircle } from './ClayIcon';

export default function Spinner({ size = 'h-8 w-8', className = '' }) {
  return (
    <div className={`flex justify-center items-center py-10 ${className}`} role="status" aria-label="Загрузка">
      <span className={size}><LoaderCircle size="100%" className="animate-spin" /></span>
    </div>
  );
}
