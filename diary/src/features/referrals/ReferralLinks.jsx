import { useState } from 'react';
import { api } from '../../utils/api';
import { AdminSection } from '../admin/AdminReport';
import { LoadState } from './ReferralParts';
import { useReferralData } from './referralData';

function CopyLink({ label, value }) {
  const [feedback, setFeedback] = useState(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback('Ссылка скопирована');
    } catch {
      setFeedback('Скопируйте ссылку из поля');
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1 ui-secondary text-sm">{label}
        <input className="ui-input" readOnly value={value} onFocus={event => event.target.select()} />
      </label>
      <button type="button" className="ui-button ui-button--secondary self-start" onClick={copy}>Копировать</button>
      {feedback && <p className="ui-muted text-sm" role="status">{feedback}</p>}
    </div>
  );
}

export default function ReferralLinks() {
  const request = useReferralData('/api/referral/links');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function create(event) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/referral/links', { method: 'POST', body: { name } });
      setName('');
      request.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!request.data) return <LoadState request={request} title="Не удалось загрузить ссылки" />;

  return (
    <div className="flex flex-col gap-4">
      <AdminSection title="Партнёрские ссылки">
        <p className="ui-muted mb-2">Создавайте отдельную ссылку для каждой площадки или кампании. Подтверждённые оплаты в вашей партнёрской ветке приносят 50% вознаграждения.</p>
        <form className="flex flex-wrap gap-2 mb-3" onSubmit={create}>
          <input className="ui-input flex-1" aria-label="Название кампании" placeholder="Название кампании" value={name}
            onChange={event => setName(event.target.value)} maxLength={100} required />
          <button className="ui-button ui-button--primary" disabled={busy || !name.trim()}>Создать ссылку</button>
        </form>
        {error && <p role="alert" className="ui-secondary">{error}</p>}
        <div className="flex flex-col gap-3">
          {request.data.partner.map(link => <CopyLink key={link.id} label={link.name} value={link.url} />)}
        </div>
      </AdminSection>
      <AdminSection title="Обычное приглашение">
        <p className="ui-muted mb-2">Ссылка добавляет человека в друзья. Приглашения внутри партнёрской цепочки сохраняют её первоначального владельца.</p>
        <CopyLink label="Ссылка для друзей" value={request.data.friend} />
      </AdminSection>
    </div>
  );
}
