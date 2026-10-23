import { CircleAlert, Inbox, LoaderCircle } from 'lucide-react';

export default function ScreenState({ title, description, loading = false, error = false, onRetry }) {
  const Icon = loading ? LoaderCircle : error ? CircleAlert : Inbox;
  return (
    <div className="screen-state" role={error ? 'alert' : 'status'}>
      <Icon size={24} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
      <p className="font-semibold">{title || (loading ? 'Загрузка…' : 'Здесь пока ничего нет')}</p>
      {description && <p className="ui-secondary">{description}</p>}
      {onRetry && <button type="button" onClick={onRetry} className="ui-button ui-button--secondary">Повторить</button>}
    </div>
  );
}
