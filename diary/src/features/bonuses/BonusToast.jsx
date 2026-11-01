import { useEffect, useState } from 'react';
import { Sparkles } from '../../components/ClayIcon';
import { useProfile } from '../../context/profile';
import { api } from '../../utils/api';
import { formatTokens } from '../diary/utils';
import './bonuses.css';

const WebApp = window.Telegram.WebApp;
const TOAST_DURATION_MS = 5000;

// «за первый тест и за портрет личности»
const joinReasons = (reasons) => (reasons.length > 1
  ? `${reasons.slice(0, -1).join(', ')} и ${reasons.at(-1)}`
  : reasons[0]);

// Сообщение сверху экрана, когда начислен бонус за первый шаг. Новые бонусы приходят с профилем:
// он обновляется после теста, отчета, записи в дневнике. Показанное сервер больше не присылает как новое
export default function BonusToast() {
  const { profile } = useProfile();
  const [shownKinds, setShownKinds] = useState([]);
  const [toast, setToast] = useState(null); // { items, id }

  const fresh = (profile?.bonuses || []).filter(b => b.new && !shownKinds.includes(b.kind));
  if (fresh.length) {
    setShownKinds([...shownKinds, ...fresh.map(b => b.kind)]);
    setToast({ items: fresh, id: shownKinds.length });
  }

  useEffect(() => {
    if (!toast) return;
    WebApp.HapticFeedback?.notificationOccurred('success');
    api('/api/bonuses/seen', { method: 'POST', body: { kinds: toast.items.map(b => b.kind) } }).catch(() => {});
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  const total = toast.items.reduce((sum, b) => sum + b.amount, 0);
  return (
    <div className="bonus-toast" role="status" aria-live="polite">
      <button key={toast.id} type="button" className="bonus-toast__card" onClick={() => setToast(null)} aria-label="Закрыть сообщение о бонусе">
        <span className="bonus-toast__icon"><Sparkles size={24} /></span>
        <span className="min-w-0">
          <span className="block font-bold text-[var(--ui-text)]">+{formatTokens(total)}</span>
          <span className="block ui-secondary">Бонус {joinReasons(toast.items.map(b => b.reason))}</span>
        </span>
      </button>
    </div>
  );
}
