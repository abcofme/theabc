import { useCallback, useEffect, useRef, useState, useId } from 'react';
import { Check, Sparkles, Wallet } from '../../components/ClayIcon';
import Page from '../../components/Page';
import Spinner from '../../components/Spinner';
import OfferPage from '../legal/OfferPage';
import { useProfile } from '../../context/profile';
import { api } from '../../utils/api';
import { currentUser, isTelegram } from '../../utils/platform';
import { formatTokens } from '../diary/utils';
import { SERVICE_DESCRIPTIONS, DeliveryInformation, ContactInformation } from '../legal/ServiceInformation';

const WebApp = window.Telegram.WebApp;
const QUICK_AMOUNTS = [100, 300, 500, 1000];
const FEATURE_PRICES = [['diary_answer', 'Ответ дневника на запись'], ['report', 'Отчет'], ['portrait', 'Портрет личности'], ['compatibility', 'Анализ совместимости']];
const PREMIUM_BENEFITS = ['Ответы дневника на каждую запись', 'Отчеты о повторяющихся событиях, реакциях, энергии и компетентности', 'Портрет личности и его обновления', 'Анализ совместимости с друзьями'];
// После перехода в ЮKassa ждем подтверждения: так баланс и Premium обновятся, даже если вебхук задержится
const PAYMENT_POLL_INTERVAL = 3000;
const PAYMENT_POLL_TIMEOUT = 15 * 60 * 1000;
const PAID_TEXT = { topup: 'Баланс пополнен.', premium: 'Premium подключен. Все функции с ИИ доступны без ограничений.' };
const formatDate = iso => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

function readPending(key) {
  try {
    const payment = JSON.parse(sessionStorage.getItem(key));
    if (payment?.id && Date.now() - payment.since < PAYMENT_POLL_TIMEOUT) return payment;
  } catch { /* В приватном режиме хранилище может быть недоступно. */ }
  return null;
}

export default function BillingPage({ onBack }) {
  const { profile, isPremium, refreshProfile } = useProfile();
  const storageKey = `azbuka-payment:${currentUser()?.id}`;
  const [pending, setPending] = useState(() => readPending(storageKey));
  const [mode, setMode] = useState(isPremium || pending?.kind === 'premium' ? 'premium' : 'balance');
  const [amount, setAmount] = useState('300');
  const [offerAccepted, setOfferAccepted] = useState(false);
  const [isOfferOpen, setIsOfferOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const requestLock = useRef(false);
  const checkLock = useRef(false);
  const id = useId();

  const checkPending = useCallback(async () => {
    if (!pending || checkLock.current) return;
    checkLock.current = true;
    const clearPending = () => {
      setPending(null);
      try { sessionStorage.removeItem(storageKey); } catch { /* Хранилище недоступно. */ }
    };
    try {
      if (Date.now() - pending.since >= PAYMENT_POLL_TIMEOUT) {
        clearPending();
        return;
      }
      const { status } = await api(`/api/subscription/status/${pending.id}`);
      if (status === 'success') {
        clearPending();
        await refreshProfile();
        WebApp.HapticFeedback?.notificationOccurred('success');
        WebApp.showAlert(PAID_TEXT[pending.kind]);
      } else if (status === 'canceled') {
        clearPending();
        WebApp.showAlert('Платёж отменён. Можно попробовать снова.');
      }
    } catch (err) { console.error('Ошибка проверки платежа:', err); }
    finally { checkLock.current = false; }
  }, [pending, refreshProfile, storageKey]);

  useEffect(() => {
    if (!pending) return;
    const initial = setTimeout(checkPending, 0);
    const interval = setInterval(checkPending, PAYMENT_POLL_INTERVAL);
    const onVisible = () => { if (document.visibilityState === 'visible') checkPending(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(initial); clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [pending, checkPending]);

  if (!profile) return <Page title="Подписка и баланс" onBack={onBack}><Spinner /></Page>;
  const { prices, balance } = profile;
  const sum = Number(amount);
  const isAmountValid = Number.isInteger(sum) && sum >= prices.min_topup && sum <= prices.max_topup;
  const pay = async (kind, path, body) => {
    if (isTelegram || pending || !offerAccepted || requestLock.current) return;
    requestLock.current = true;
    setBusy(kind);
    try {
      const { url, payment_id } = await api(path, { method: 'POST', body });
      const payment = { id: payment_id, kind, since: Date.now(), url };
      setPending(payment);
      try { sessionStorage.setItem(storageKey, JSON.stringify(payment)); } catch { /* Хранилище недоступно. */ }
      window.location.assign(url);
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
    <input type="checkbox" checked={offerAccepted} onChange={event => setOfferAccepted(event.target.checked)} disabled={!!busy} className="ui-checkbox mt-px" />
    <span>Принимаю условия <button type="button" onClick={event => { event.preventDefault(); setIsOfferOpen(true); }} className="underline underline-offset-4 text-[var(--ui-text)]">публичной оферты</button> и правил предоставления услуг</span>
  </label>;
  return (
    <Page title="Подписка и баланс" onBack={onBack}>
      <div className="ui-stack">
        <section className={`ui-card ${isPremium ? 'billing-premium' : ''}`}>
          {isPremium ? <>
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3"><Sparkles size={20} className="text-[var(--ui-gold)]" /> Premium активен</h3>
            <Row label="Действует до" value={formatDate(profile.access_expires_at)} />
            <Row label="Автопродление" value={profile.has_active_subscription ? 'включено' : 'выключено'} />
            <Row label="Баланс" value={formatTokens(balance)} />
            {profile.has_active_subscription && <button type="button" onClick={cancelAutoRenewal} disabled={!!busy} className="ui-button ui-button--outline mt-4">{busy === 'cancel' ? 'Отмена…' : 'Отменить автопродление'}</button>}
          </> : <>
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-2"><Wallet size={20} /> Баланс: {formatTokens(balance)}</h3>
            <p className="ui-secondary">Оплачивай функции токенами по мере использования или подключи Premium. Если функция не сработала, токены возвращаются.</p>
          </>}
        </section>
        <div className="ui-segmented" role="tablist" aria-label="Способ оплаты">
          {['balance', 'premium'].map(value => <button key={value} id={`${id}-${value}`} type="button" role="tab" aria-controls={`${id}-panel-${value}`} aria-selected={mode === value} onClick={() => setMode(value)} disabled={!!busy}>{value === 'balance' ? <><Wallet size={16} aria-hidden="true" /> С баланса</> : <><Sparkles size={16} aria-hidden="true" /> Premium</>}</button>)}
        </div>
        <section id={`${id}-panel-${mode}`} role="tabpanel" aria-labelledby={`${id}-${mode}`} className={`ui-card ${mode === 'premium' ? 'billing-premium' : ''}`}>
          {mode === 'balance' ? <>
            <h3 className="text-lg font-semibold mb-3">Оплата с баланса</h3>
            <div className="mb-6">{FEATURE_PRICES.map(([key, label]) => <div key={key} className="mb-3"><Row label={label} value={formatTokens(prices[key])} /><p className="ui-secondary text-sm">{SERVICE_DESCRIPTIONS[key]}</p></div>)}</div>
            {isTelegram ? <p className="ui-secondary">Пополнение баланса доступно в браузерной версии «Азбуки Я».</p> : <>
            <h4 className="font-semibold">Пополнить баланс</h4>
            <p className="ui-secondary mb-3">1 ₽ = {formatTokens(prices.tokens_per_ruble)}</p>
            <div className="grid grid-cols-2 min-[360px]:grid-cols-4 gap-2 mb-4">{QUICK_AMOUNTS.map(value => <button key={value} type="button" aria-pressed={sum === value} onClick={() => setAmount(String(value))} className={`clay-raised-sm min-h-11 rounded-xl text-sm font-semibold ${sum === value ? 'bg-[var(--ui-text)] text-rose-950' : 'bg-rose-950 text-[var(--ui-text)]'}`}>{value} ₽</button>)}</div>
            <label className="ui-secondary block" htmlFor={`${id}-amount`}>Своя сумма, от {prices.min_topup} до {prices.max_topup} ₽</label>
            <input id={`${id}-amount`} type="number" inputMode="numeric" min={prices.min_topup} max={prices.max_topup} value={amount} onChange={event => setAmount(event.target.value.replace(/\D/g, ''))} className="ui-input mt-2" />
            {consent}
            <button type="button" onClick={() => pay('topup', '/api/balance/topup', { amount: sum })} disabled={!isAmountValid || !offerAccepted || !!busy || !!pending} className="ui-button ui-button--primary">{busy === 'topup' ? 'Создаю платеж…' : isAmountValid ? `Купить ${formatTokens(sum * prices.tokens_per_ruble)} за ${sum.toLocaleString('ru-RU')} ₽` : `Сумма от ${prices.min_topup} до ${prices.max_topup} ₽`}</button>
            {pending?.kind === 'topup' && <PendingNote url={pending.url} />}
            </>}
          </> : <>
            <div className="flex items-center gap-3 mb-4">
              <span className="billing-premium__icon" aria-hidden="true"><Sparkles size={22} /></span>
              <div>
                <h3 className="text-xl font-semibold leading-7">Premium</h3>
                <p className="text-[var(--ui-gold)] font-semibold">{prices.premium} ₽ за 30 дней</p>
              </div>
            </div>
            <p className="ui-secondary mb-4">Все функции с ИИ без ограничений:</p>
            <ul className="flex flex-col gap-3">{PREMIUM_BENEFITS.map(item => <li key={item} className="flex gap-3 text-base leading-6"><Check size={20} className="text-[var(--ui-gold)] shrink-0 mt-0.5" /><span>{item}</span></li>)}</ul>
            {isPremium ? <p className="ui-secondary mt-5">Все возможности Premium уже доступны.</p> : isTelegram ? (
              <p className="ui-secondary mt-5">Оформление Premium доступно в браузерной версии «Азбуки Я».</p>
            ) : <>
              <p className="ui-secondary text-sm mt-4">{profile.premium_autorenew
                ? `При оформлении подключается автопродление за ${prices.premium} ₽ каждые 30 дней. Отменить его можно в этом разделе.`
                : 'Разовая оплата за 30 дней доступа.'}</p>
              {consent}
              <button type="button" onClick={() => pay('premium', '/api/subscription/buy')} disabled={!offerAccepted || !!busy || !!pending} className="ui-button ui-button--primary">{busy === 'premium' ? 'Создаю платеж…' : `Оформить · ${prices.premium} ₽`}</button>
              {pending?.kind === 'premium' && <PendingNote url={pending.url} />}
            </>}
          </>}
        </section>
        <section className="ui-card">
          <h3 className="text-lg font-semibold mb-3">Как получить услугу</h3>
          <DeliveryInformation />
          <details className="mt-5"><summary className="font-semibold py-2">Контакты и реквизиты</summary><div className="mt-3"><ContactInformation /></div></details>
        </section>
      </div>
      {isOfferOpen && <OfferPage onBack={() => setIsOfferOpen(false)} />}
    </Page>
  );
}

function PendingNote({ url }) {
  return <div className="ui-secondary mt-3 text-center">
    <p role="status">Ждём подтверждения оплаты.</p>
    {url && <a href={url} className="underline underline-offset-4">Вернуться к оплате</a>}
  </div>;
}

function Row({ label, value }) {
  return <div className="flex items-baseline justify-between gap-3 py-2 text-sm"><span className="text-[var(--ui-secondary)]">{label}</span><span className="font-semibold text-right shrink-0">{value}</span></div>;
}
