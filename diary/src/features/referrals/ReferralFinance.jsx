import { useRef, useState } from 'react';
import { api } from '../../utils/api';
import { AdminRow, AdminSection } from '../admin/AdminReport';
import { LoadState, Pages } from './ReferralParts';
import { STATUS, displayDate, kopecks, useReferralData } from './referralData';

export default function ReferralFinance({ query }) {
  const [page, setPage] = useState(1);
  const [withdrawalPage, setWithdrawalPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const requestKey = useRef(null);
  const data = useReferralData(query === null ? null : `/api/referral/finance?${query}&page=${page}&withdrawal_page=${withdrawalPage}`);

  async function withdraw(amount) {
    if (busy) return;
    requestKey.current ??= crypto.randomUUID();
    setBusy(true);
    setFeedback(null);
    try {
      await api('/api/referral/withdraw', { method: 'POST', body: { request_key: requestKey.current, amount_kopecks: amount } });
      requestKey.current = null;
      setFeedback({ message: 'Заявка создана. Статус появится в истории выплат.' });
      setWithdrawalPage(1);
      data.reload();
    } catch (error) {
      setFeedback({ message: error.message, error: true });
    } finally {
      setBusy(false);
    }
  }

  if (!data.data) return <LoadState request={data} title="Не удалось загрузить вознаграждения" />;
  const { balance, earnings, withdrawals, more_earnings, more_withdrawals } = data.data;

  return (
    <div className="flex flex-col gap-4">
      <AdminSection title="Баланс вознаграждений">
        <AdminRow label="Доступно к выводу" value={kopecks(balance.available)} />
        <AdminRow label="В заявке на вывод" value={kopecks(balance.reserved)} />
        <AdminRow label="Уже выплачено" value={kopecks(balance.paid)} />
        <AdminRow label="Всего начислено" value={kopecks(balance.earned)} />
        <p className="ui-muted text-sm my-2">Минимум для заявки {kopecks(balance.minimum)}. Администратор переводит деньги вручную.</p>
        <button type="button" className="ui-button ui-button--primary"
          disabled={busy || balance.reserved > 0 || balance.available < balance.minimum}
          onClick={() => withdraw(balance.available)}>
          {busy ? 'Отправляем заявку…' : 'Запросить вывод'}
        </button>
        {feedback && <p role={feedback.error ? 'alert' : 'status'} className="ui-secondary text-sm">{feedback.message}</p>}
      </AdminSection>

      <AdminSection title="Начисления за период">
        {earnings.length === 0 && <p className="ui-muted">Начислений за период не было.</p>}
        {earnings.map(earning => (
          <AdminRow key={earning.id} label={earning.member_id ? `Участник №${earning.member_id}` : 'Перенесённое начисление'}
            hint={displayDate(earning.created_at, true)}
            value={kopecks(earning.amount_kopecks)} />
        ))}
        <Pages page={page} more={more_earnings} onChange={setPage} label="Страницы начислений" />
      </AdminSection>

      <AdminSection title="История заявок">
        {withdrawals.length === 0 && <p className="ui-muted">Заявок пока нет.</p>}
        {withdrawals.map(row => (
          <AdminRow key={row.id} label={`№${row.id} · ${STATUS[row.status]}`}
            hint={`${displayDate(row.created_at, true)}${row.note ? ' · ' + row.note : ''}`} value={kopecks(row.amount_kopecks)} />
        ))}
        <Pages page={withdrawalPage} more={more_withdrawals} onChange={setWithdrawalPage} label="Страницы заявок" />
      </AdminSection>
    </div>
  );
}
