import ScreenState from '../../components/ScreenState';
import { AdminRow, AdminSection } from '../admin/AdminReport';
import { LABELS, kopecks, number, rubles } from './referralData';

export function LoadState({ request, title }) {
  if (request.loading) return <ScreenState loading />;
  if (request.error) {
    return <ScreenState error title={title} description={request.error.message} onRetry={request.reload} />;
  }
  return null;
}

export function Pages({ page, more, onChange, label = 'Страницы' }) {
  if (page === 1 && !more) return null;
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-2 pt-2">
      <button type="button" className="ui-button ui-button--secondary" disabled={page === 1} onClick={() => onChange(page - 1)}>Назад</button>
      <span className="ui-muted text-sm">{page}</span>
      <button type="button" className="ui-button ui-button--secondary" disabled={!more} onClick={() => onChange(page + 1)}>Дальше</button>
    </nav>
  );
}

export function CountList({ values, empty }) {
  const rows = Object.entries(values || {});
  if (!rows.length) return <p className="ui-muted py-2">{empty}</p>;
  return rows.map(([key, count]) => <AdminRow key={key} label={LABELS[key] || key} value={number(count)} />);
}

export function ReferralMetrics({ stats, summary = false }) {
  return (
    <div className="flex flex-col gap-3">
      {summary && <AdminSection title="Аудитория">
        <AdminRow label="Приглашено за период" value={number(stats.invited)} hint={`Прямые приглашения · ${number(stats.direct)}`} />
        <AdminRow label="Открывали приложение" value={number(stats.active)} />
        <AdminRow label="Всего в выбранной ветке" value={number(stats.members)} />
      </AdminSection>}
      <AdminSection title="Оплаты и токены">
        <AdminRow label="Пополнения баланса" value={number(stats.topups)} />
        <AdminRow label="Сумма пополнений" value={rubles(stats.topup_rubles)} />
        <AdminRow label="Сумма подтверждённых оплат" value={rubles(stats.paid_rubles)}
          hint={stats.unknown_payments ? `Исторические платежи без суммы · ${number(stats.unknown_payments)}` : undefined} />
        <AdminRow label="Куплено токенов" value={number(stats.tokens.topup)} />
        <AdminRow label="Бонусные и стартовые токены" value={number(stats.tokens.bonus + stats.tokens.demo)} />
        <AdminRow label="Потрачено на услуги" value={number(stats.tokens.spent)} />
        {stats.tokens.pending > 0 && <AdminRow label="Токены в обработке" value={number(stats.tokens.pending)} />}
        <AdminRow label="Возвращено токенов" value={number(stats.tokens.refunded)} />
        <AdminRow label="Партнёрское вознаграждение" value={kopecks(stats.commission)} />
      </AdminSection>
      <AdminSection title="Купленные услуги">
        <CountList values={stats.purchases} empty="Покупок за период не было." />
      </AdminSection>
      <AdminSection title="Использование функций">
        <CountList values={stats.usage} empty="Событий за период не было." />
      </AdminSection>
    </div>
  );
}
