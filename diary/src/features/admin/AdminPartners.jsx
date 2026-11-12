import { useState } from 'react';
import Select from '../../components/Select';
import { api } from '../../utils/api';
import { ReferralCabinet } from '../referrals/ReferralCabinet';
import { LoadState, Pages } from '../referrals/ReferralParts';
import { STATUS, displayDate, kopecks, useReferralData } from '../referrals/referralData';
import { AdminRow, AdminSection } from './AdminReport';

const TABS = [['analytics', 'Аналитика'], ['access', 'Доступ'], ['payouts', 'Заявки']];

function Access() {
  const [page, setPage] = useState(1);
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const request = useReferralData(`/api/admin/referral/accounts?page=${page}`);

  async function change(user, enabled) {
    if (busy || !user.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      const account = await api('/api/admin/referral/access', { method: 'POST', body: { user, enabled } });
      const name = account.username ? `@${account.username}` : `ID ${account.id}`;
      setFeedback({ message: enabled ? `Доступ выдан · ${name}` : `Доступ закрыт · ${name}` });
      setIdentifier('');
      setPage(1);
      request.reload();
    } catch (error) {
      setFeedback({ error: true, message: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AdminSection title="Партнёрский доступ">
        <p className="ui-muted mb-2">Кабинет открывается после выдачи доступа. Можно указать ник Telegram или ID аккаунта.</p>
        <form className="flex flex-col gap-2" onSubmit={event => { event.preventDefault(); change(identifier, true); }}>
          <input className="ui-input" aria-label="Пользователь Telegram" placeholder="@username или ID"
            value={identifier} maxLength={100} onChange={event => setIdentifier(event.target.value)} required />
          <div className="flex flex-wrap gap-2">
            <button className="ui-button ui-button--primary" disabled={busy || !identifier.trim()}>Выдать доступ</button>
            <button type="button" className="ui-button ui-button--secondary" disabled={busy || !identifier.trim()}
              onClick={() => change(identifier, false)}>Закрыть доступ</button>
          </div>
        </form>
        {feedback && <p role={feedback.error ? 'alert' : 'status'} className="ui-secondary mt-2">{feedback.message}</p>}
      </AdminSection>
      <LoadState request={request} title="Не удалось загрузить партнёров" />
      {request.data && <AdminSection title="Управление партнёрами">
        {request.data.accounts.length === 0 && <p className="ui-muted">Доступ ещё никому не выдавался.</p>}
        {request.data.accounts.map(account => (
          <AdminRow key={account.id} label={account.username ? `@${account.username}` : account.name || `ID ${account.id}`}
            hint={`ID ${account.id} · ${account.enabled ? 'доступ открыт' : 'доступ закрыт'}`}
            value={<button type="button" className="ui-button ui-button--secondary" disabled={busy}
              onClick={() => change(account.id, !account.enabled)}>{account.enabled ? 'Закрыть' : 'Открыть'}</button>} />
        ))}
        <Pages page={page} more={request.data.more} onChange={setPage} label="Страницы партнёров" />
      </AdminSection>}
    </>
  );
}

function Withdrawals() {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const request = useReferralData(`/api/admin/referral/withdrawals?status=${status}&page=${page}`);

  async function resolve(row, status) {
    if (busy) return;
    const question = status === 'paid'
      ? `Отметить заявку №${row.id} на ${kopecks(row.amount_kopecks)} как выплаченную после ручного перевода?`
      : `Отклонить заявку №${row.id} и вернуть сумму на доступный баланс?`;
    if (!window.confirm(question)) return;
    setBusy(true);
    setFeedback(null);
    try {
      await api(`/api/admin/referral/withdrawals/${row.id}`, { method: 'POST', body: { status } });
      setFeedback({ message: `Заявка №${row.id} · ${STATUS[status]}` });
      request.reload();
    } catch (error) {
      setFeedback({ error: true, message: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminSection title="Ручные выплаты">
      <p className="ui-muted mb-2">После перевода отметьте заявку как выплаченную. При отклонении сумма снова доступна партнёру.</p>
      <label className="flex flex-col gap-1 ui-secondary text-sm mb-2">Статус
        <Select className="ui-input" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
          <option value="pending">Ожидают перевода</option>
          <option value="paid">Выплачены</option>
          <option value="rejected">Отклонены</option>
          <option value="all">Все заявки</option>
        </Select>
      </label>
      {feedback && <p role={feedback.error ? 'alert' : 'status'} className="ui-secondary">{feedback.message}</p>}
      <LoadState request={request} title="Не удалось загрузить заявки" />
      {request.data && <>
        {request.data.withdrawals.length === 0 && <p className="ui-muted">Заявок с таким статусом нет.</p>}
        {request.data.withdrawals.map(row => (
          <div key={row.id} className="admin-breakdown py-1">
            <AdminRow label={`№${row.id} · ${row.username ? '@' + row.username : row.name || 'Партнёр'}`}
              hint={`ID ${row.partner_id} · ${displayDate(row.created_at, true)} · ${STATUS[row.status]}`}
              value={kopecks(row.amount_kopecks)} />
            {row.payout_phone && row.payout_bank ? (
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 pb-2 text-sm ui-secondary">
                <dt>Телефон для СБП</dt><dd className="select-text">{row.payout_phone}</dd>
                <dt>Банк получателя</dt><dd className="select-text [overflow-wrap:anywhere]">{row.payout_bank}</dd>
              </dl>
            ) : row.status === 'pending' && <p className="ui-muted text-sm mb-2">Реквизиты не указаны.</p>}
            {row.status === 'pending' && <div className="flex flex-wrap gap-2 mb-2">
              <button type="button" className="ui-button ui-button--primary" disabled={busy}
                onClick={() => resolve(row, 'paid')}>Отметить выплату</button>
              <button type="button" className="ui-button ui-button--secondary" disabled={busy}
                onClick={() => resolve(row, 'rejected')}>Отклонить</button>
            </div>}
          </div>
        ))}
        <Pages page={page} more={request.data.more} onChange={setPage} label="Страницы заявок" />
      </>}
    </AdminSection>
  );
}

export default function AdminPartners() {
  const [view, setView] = useState('access');

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Управление партнёрской программой" className="ui-segmented">
        {TABS.map(([value, label]) => (
          <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>
        ))}
      </div>
      {view === 'access' && <Access />}
      {view === 'analytics' && <ReferralCabinet admin />}
      {view === 'payouts' && <Withdrawals />}
    </div>
  );
}
