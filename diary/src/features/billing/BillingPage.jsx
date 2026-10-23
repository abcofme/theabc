import { useRef, useState, useId } from 'react';
import { Check, Sparkles, Wallet } from 'lucide-react';
import Page from '../../components/Page';
import Spinner from '../../components/Spinner';
import OfferPage from '../legal/OfferPage';
import { useProfile } from '../../context/profile';
import { api } from '../../utils/api';

const WebApp = window.Telegram.WebApp;
const QUICK_AMOUNTS = [100, 300, 500, 1000];
const FEATURE_PRICES = [['diary_answer', 'Ответ дневника на запись'], ['report', 'Отчет'], ['portrait', 'Портрет личности'], ['compatibility', 'Анализ совместимости']];
const PREMIUM_BENEFITS = ['Ответы дневника на каждую запись', 'Отчеты о повторяющихся событиях, реакциях, энергии и компетентности', 'Портрет личности и его обновления', 'Анализ совместимости с друзьями'];
const formatDate = iso => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

export default function BillingPage({ onBack }) {
  const { profile, isPremium, refreshProfile } = useProfile();
  const [mode, setMode] = useState(isPremium ? 'premium' : 'balance');
  const [amount, setAmount] = useState('300');
  const [offerAccepted, setOfferAccepted] = useState(false);
  const [isOfferOpen, setIsOfferOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const requestLock = useRef(false);
  const id = useId();
  if (!profile) return <Page title="Подписка и баланс" onBack={onBack}><Spinner /></Page>;
  const { prices, balance } = profile;
  const sum = Number(amount);
  const isAmountValid = Number.isInteger(sum) && sum >= prices.min_topup && sum <= prices.max_topup;
  const pay = async (kind, path, body) => {
    if (!offerAccepted || requestLock.current) return;
    requestLock.current = true;
    setBusy(kind);
    try {
      const { url } = await api(path, { method: 'POST', body });
      WebApp.openLink(url);
    } catch (err) { WebApp.showAlert(err.message || 'Не удалось создать платеж'); }
    finally { requestLock.current = false; setBusy(null); }
  };
  const cancelAutoRenewal = () => WebApp.showConfirm('Отменить автопродление Premium? Подписка будет действовать до конца оплаченного периода.', async confirmed => {
    if (!confirmed || requestLock.current) return;
    requestLock.current = true;
    setBusy('cancel');
    try {
      await api('/api/subscription/cancel', { method: 'POST' });
      await refreshProfile();
      WebApp.showAlert('Автопродление отменено.');
    } catch (err) { WebApp.showAlert(err.message || 'Не удалось отменить автопродление'); }
    finally { requestLock.current = false; setBusy(null); }
  });
  const consent = <label className="flex items-start gap-3 ui-secondary my-5 py-1">
    <input type="checkbox" checked={offerAccepted} onChange={event => setOfferAccepted(event.target.checked)} disabled={!!busy} className="w-5 h-5 mt-0.5 accent-emerald-800 shrink-0" />
    <span>Я согласен с <button type="button" onClick={event => { event.preventDefault(); setIsOfferOpen(true); }} className="underline underline-offset-4 text-[#F5E6D3]">публичной офертой</button> и правилами предоставления услуг</span>
  </label>;
  return (
    <Page title="Подписка и баланс" onBack={onBack}>
      <div className="ui-stack">
        <section className="ui-card">
          {isPremium ? <>
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3"><Sparkles size={20} /> Premium активен</h3>
            <Row label="Действует до" value={formatDate(profile.access_expires_at)} />
            <Row label="Автопродление" value={profile.has_active_subscription ? 'включено' : 'выключено'} />
            <Row label="Баланс" value={`${balance} ₽`} />
            {profile.has_active_subscription && <button type="button" onClick={cancelAutoRenewal} disabled={!!busy} className="ui-button ui-button--outline mt-4">{busy === 'cancel' ? 'Отмена…' : 'Отменить автопродление'}</button>}
          </> : <>
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-2"><Wallet size={20} /> Баланс: {balance} ₽</h3>
            <p className="ui-secondary">Оплачивай функции по мере использования или подключи Premium. Если функция не сработала, деньги возвращаются.</p>
          </>}
        </section>
        <div className="ui-segmented" role="tablist" aria-label="Способ оплаты">
          {['balance', 'premium'].map(value => <button key={value} id={`${id}-${value}`} type="button" role="tab" aria-controls={`${id}-panel-${value}`} aria-selected={mode === value} onClick={() => setMode(value)} disabled={!!busy}>{value === 'balance' ? 'С баланса' : 'Premium'}</button>)}
        </div>
        <section id={`${id}-panel-${mode}`} role="tabpanel" aria-labelledby={`${id}-${mode}`} className="ui-card">
          {mode === 'balance' ? <>
            <h3 className="text-lg font-semibold mb-3">Оплата с баланса</h3>
            <div className="mb-6">{FEATURE_PRICES.map(([key, label]) => <Row key={key} label={label} value={`${prices[key]} ₽`} />)}</div>
            <h4 className="font-semibold mb-3">Пополнить баланс</h4>
            <div className="grid grid-cols-2 min-[360px]:grid-cols-4 gap-2 mb-4">{QUICK_AMOUNTS.map(value => <button key={value} type="button" aria-pressed={sum === value} onClick={() => setAmount(String(value))} className={`min-h-11 rounded-xl text-sm font-semibold ${sum === value ? 'bg-[#F5E6D3] text-rose-950' : 'bg-rose-950 text-[#F5E6D3]'}`}>{value} ₽</button>)}</div>
            <label className="ui-secondary block" htmlFor={`${id}-amount`}>Своя сумма, от {prices.min_topup} до {prices.max_topup} ₽</label>
            <input id={`${id}-amount`} type="number" inputMode="numeric" min={prices.min_topup} max={prices.max_topup} value={amount} onChange={event => setAmount(event.target.value.replace(/\D/g, ''))} className="ui-input mt-2" />
            {consent}
            <button type="button" onClick={() => pay('topup', '/api/balance/topup', { amount: sum })} disabled={!isAmountValid || !offerAccepted || !!busy} className="ui-button ui-button--primary">{busy === 'topup' ? 'Создаю платеж…' : isAmountValid ? `Пополнить на ${sum} ₽` : `Сумма от ${prices.min_topup} до ${prices.max_topup} ₽`}</button>
          </> : <>
            <h3 className="text-xl font-semibold mb-2">Premium · {prices.premium} ₽ в месяц</h3>
            <p className="ui-secondary mb-5">Все функции с ИИ без ограничений:</p>
            <ul className="flex flex-col gap-3">{PREMIUM_BENEFITS.map(item => <li key={item} className="flex gap-3 text-base leading-6"><Check size={20} className="text-[#7BA887] shrink-0 mt-0.5" /><span>{item}</span></li>)}</ul>
            {!isPremium ? <>{consent}<button type="button" onClick={() => pay('premium', '/api/subscription/buy')} disabled={!offerAccepted || !!busy} className="ui-button ui-button--primary">{busy === 'premium' ? 'Создаю платеж…' : `Оформить · ${prices.premium} ₽ в месяц`}</button></> : <p className="ui-secondary mt-5">Все возможности Premium уже доступны.</p>}
          </>}
        </section>
      </div>
      {isOfferOpen && <OfferPage onBack={() => setIsOfferOpen(false)} />}
    </Page>
  );
}

function Row({ label, value }) {
  return <div className="flex items-baseline justify-between gap-3 py-2 text-sm"><span className="text-[#F5E6D3]/75">{label}</span><span className="font-semibold text-right shrink-0">{value}</span></div>;
}
