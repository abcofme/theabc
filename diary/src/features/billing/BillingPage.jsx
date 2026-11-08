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
const PAYMENT_STORAGE = isTelegram ? 'localStorage' : 'sessionStorage';
const PAID_TEXT = { topup: 'Баланс пополнен.', premium: 'Premium подключен. Все функции с ИИ доступны без ограничений.' };
const formatDate = iso => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

function readPending(key) {
  try {
    const payment = JSON.parse(window[PAYMENT_STORAGE].getItem(key));
    if (payment?.id && Date.now() - payment.since < PAYMENT_POLL_TIMEOUT) return payment;
  } catch { /* В приватном режиме хранилище может быть недоступно. */ }
  return null;
}

export default function BillingPage({ onBack }) {
  const { profile, isPremium, refreshProfile } = useProfile();
  const storageKey = `azbuka-payment:${currentUser()?.id}`;
  const [pending, setPending] = useState(() => readPending(storageKey));
  const activePayment = useRef(pending);
  const [selectedMode, setMode] = useState(() => {
    if (pending) return pending.kind === 'premium' ? 'premium' : 'balance';
    const requested = new URLSearchParams(window.location.search).get('billing');
    if (requested === 'balance' || requested === 'premium') return requested;
    return isPremium ? 'premium' : 'balance';
  });
  const mode = isPremium ? 'premium' : selectedMode;
  const title = isPremium ? 'Подписка' : 'Подписка и баланс';
  const [amount, setAmount] = useState(() => pending?.amount?.toString() ?? '300');
  const [offerAccepted, setOfferAccepted] = useState(false);
  const [autorenewAccepted, setAutorenewAccepted] = useState(false);
  const [isOfferOpen, setIsOfferOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const requestLock = useRef(false);
  const checkingPayment = useRef(null);
  const id = useId();

  const updatePending = useCallback(payment => {
    const previous = activePayment.current;
    activePayment.current = payment;
    setPending(payment);
    try {
      if (payment) {
        window[PAYMENT_STORAGE].setItem(storageKey, JSON.stringify(payment));
      } else {
        const saved = readPending(storageKey);
        if (!saved || saved.id === previous?.id) window[PAYMENT_STORAGE].removeItem(storageKey);
      }
    } catch { /* Хранилище недоступно. */ }
  }, [storageKey]);

  const checkPending = useCallback(async () => {
    const payment = activePayment.current;
    if (!payment || checkingPayment.current === payment) return;
    checkingPayment.current = payment;
    try {
      if (Date.now() - payment.since >= PAYMENT_POLL_TIMEOUT) {
        updatePending(null);
        return;
      }
      const { status } = await api(`/api/subscription/status/${payment.id}`);
      if (activePayment.current !== payment) return;
      if (status === 'success') {
        updatePending(null);
        await refreshProfile();
        WebApp.HapticFeedback?.notificationOccurred('success');
        WebApp.showAlert(PAID_TEXT[payment.kind]);
      } else if (status === 'canceled') {
        updatePending(null);
        WebApp.showAlert('Платёж отменён. Можно попробовать снова.');
      }
    } catch (err) { console.error('Ошибка проверки платежа:', err); }
    finally {
      if (checkingPayment.current === payment) checkingPayment.current = null;
    }
  }, [refreshProfile, updatePending]);

  useEffect(() => {
    if (!pending) return;
    const onVisible = () => { if (document.visibilityState === 'visible') checkPending(); };
    const initial = setTimeout(onVisible, 0);
    const interval = setInterval(onVisible, PAYMENT_POLL_INTERVAL);
    document.addEventListener('visibilitychange', onVisible);
    WebApp.onEvent?.('activated', checkPending);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      WebApp.offEvent?.('activated', checkPending);
    };
  }, [pending, checkPending]);

  if (!profile) return <Page title={title} onBack={onBack}><Spinner /></Page>;
  const { prices, balance } = profile;
  const premiumDays = profile.premium_period_days ?? 30;
  const purchaseTerms = profile.premium_autorenew && autorenewAccepted ? {
    autorenew: {
      terms_version: profile.premium_autorenew_terms_version,
      amount: prices.premium,
      period_days: premiumDays,
    },
  } : undefined;
  const sum = Number(amount);
  const isAmountValid = Number.isInteger(sum) && sum >= prices.min_topup && sum <= prices.max_topup;
  const pay = async (kind, path, body, method) => {
    if (activePayment.current || !offerAccepted || requestLock.current) return;
    requestLock.current = true;
    setBusy(kind);
    try {
      const checkoutId = isTelegram ? crypto.randomUUID?.() : null;
      const query = new URLSearchParams();
      if (checkoutId) query.set('checkout_id', checkoutId);
      if (method) query.set('method', method);
      const params = query.toString();
      const request = api(params ? `${path}?${params}` : path, { method: 'POST', body });
      if (checkoutId) {
        // Telegram принимает команду открытия ссылки только сразу после нажатия.
        try { WebApp.openLink(`${window.location.origin}/checkout.html#id=${checkoutId}`); }
        catch { /* Ссылка ЮKassa появится в блоке ожидающего платежа. */ }
      }
      const { url, payment_id } = await request;
      updatePending({ id: payment_id, kind, since: Date.now(), url, amount: body?.amount });
      if (!isTelegram) window.location.assign(url);
      else if (!checkoutId) WebApp.openLink(url);
    } catch (err) { WebApp.showAlert(err.message || 'Не удалось создать платеж'); }
    finally { requestLock.current = false; setBusy(null); }
  };
  const closeCheckout = () => {
    const payment = activePayment.current;
    if (!payment) return;
    updatePending(null);
    setMode(payment.kind === 'topup' ? 'balance' : 'premium');
  };
  const cancelSubscription = () => WebApp.showPopup({
    title: 'Отмена подписки',
    message: 'Автопродление отключится, а способ оплаты отвяжется. Доступ к Premium сохранится до конца оплаченного периода.',
    buttons: [
      { id: 'back', type: 'cancel', text: 'Назад' },
      { id: 'cancel_subscription', type: 'destructive', text: 'Отменить подписку' },
    ],
  }, async action => {
    if (action !== 'cancel_subscription' || requestLock.current) return;
    requestLock.current = true;
    setBusy('cancel');
    try {
      await api('/api/subscription/cancel', { method: 'POST' });
      setAutorenewAccepted(false);
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
    <Page title={title} onBack={onBack}>
      <div className="ui-stack">
        <section className={`ui-card ${isPremium ? 'billing-premium' : ''}`}>
          {isPremium ? <>
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3"><Sparkles size={20} className="text-[var(--ui-gold)]" /> Premium активен</h3>
            <Row label="Действует до" value={formatDate(profile.access_expires_at)} />
            {!profile.has_active_subscription && <Row label="Автопродление" value="выключено" />}
          </> : <>
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-2"><Wallet size={20} /> Баланс: {formatTokens(balance)}</h3>
            <p className="ui-secondary">Оплачивай функции токенами по мере использования или подключи Premium. Если функция не сработала, токены возвращаются.</p>
          </>}
        </section>
        {profile.has_active_subscription && <section className="ui-card">
          <h3 className="font-semibold">Автопродление Premium</h3>
          {profile.autorenew_amount != null && <Row label="Сумма списания" value={`${profile.autorenew_amount} ₽`} />}
          {profile.autorenew_not_before && <Row label="Списание не раньше" value={formatDate(profile.autorenew_not_before)} />}
          <button type="button" onClick={cancelSubscription} disabled={!!busy} className="ui-button ui-button--outline mt-4">
            {busy === 'cancel' ? 'Отмена…' : 'Отменить подписку'}
          </button>
        </section>}
        {pending && <PendingNote
          url={pending.url}
          onClose={closeCheckout}
          canChangeAmount={!isPremium && pending.kind === 'topup'}
        />}
        {!isPremium && <div className="ui-segmented" role="tablist" aria-label="Способ оплаты">
          {['balance', 'premium'].map(value => <button key={value} id={`${id}-${value}`} type="button" role="tab" aria-controls={`${id}-panel-${value}`} aria-selected={mode === value} onClick={() => setMode(value)} disabled={!!busy}>{value === 'balance' ? <><Wallet size={16} aria-hidden="true" /> С баланса</> : <><Sparkles size={16} aria-hidden="true" /> Premium</>}</button>)}
        </div>}
        <section id={`${id}-panel-${mode}`} role={isPremium ? undefined : 'tabpanel'} aria-labelledby={isPremium ? undefined : `${id}-${mode}`} className={`ui-card ${mode === 'premium' ? 'billing-premium' : ''}`}>
          {mode === 'balance' ? <>
            <h3 className="text-lg font-semibold mb-3">Оплата с баланса</h3>
            <div className="mb-6">{FEATURE_PRICES.map(([key, label]) => <div key={key} className="mb-3"><Row label={label} value={formatTokens(prices[key])} /><p className="ui-secondary text-sm">{SERVICE_DESCRIPTIONS[key]}</p></div>)}</div>
            <h4 className="font-semibold">Пополнить баланс</h4>
            <p className="ui-secondary mb-3">1 ₽ = {formatTokens(prices.tokens_per_ruble)}</p>
            <div className="grid grid-cols-2 min-[360px]:grid-cols-4 gap-2 mb-4">{QUICK_AMOUNTS.map(value => <button key={value} type="button" aria-pressed={sum === value} onClick={() => setAmount(String(value))} className={`clay-raised-sm min-h-11 rounded-xl text-sm font-semibold ${sum === value ? 'bg-[var(--ui-text)] text-rose-950' : 'bg-rose-950 text-[var(--ui-text)]'}`}>{value} ₽</button>)}</div>
            <label className="ui-secondary block" htmlFor={`${id}-amount`}>Своя сумма, от {prices.min_topup} до {prices.max_topup} ₽</label>
            <input id={`${id}-amount`} type="number" inputMode="numeric" min={prices.min_topup} max={prices.max_topup} value={amount} onChange={event => setAmount(event.target.value.replace(/\D/g, ''))} className="ui-input mt-2" />
            {consent}
            <p className="ui-secondary mb-3">
              {isAmountValid ? `${formatTokens(sum * prices.tokens_per_ruble)} за ${sum.toLocaleString('ru-RU')} ₽` : `Сумма от ${prices.min_topup} до ${prices.max_topup} ₽`}
            </p>
            <CheckoutActions
              onPay={method => pay('topup', '/api/balance/topup', { amount: sum }, method)}
              disabled={!isAmountValid || !offerAccepted || !!busy || !!pending}
              creating={busy === 'topup'}
            />
          </> : <>
            <div className="flex items-center gap-3 mb-4">
              <span className="billing-premium__icon" aria-hidden="true"><Sparkles size={22} /></span>
              <div>
                <h3 className="text-xl font-semibold leading-7">Premium</h3>
                <p className="text-[var(--ui-gold)] font-semibold">{prices.premium} ₽ за {premiumDays} дней</p>
              </div>
            </div>
            <p className="ui-secondary mb-4">Все функции с ИИ без ограничений:</p>
            <ul className="flex flex-col gap-3">{PREMIUM_BENEFITS.map(item => <li key={item} className="flex gap-3 text-base leading-6"><Check size={20} className="text-[var(--ui-gold)] shrink-0 mt-0.5" /><span>{item}</span></li>)}</ul>
            {isPremium ? <p className="ui-secondary mt-5">Все возможности Premium уже доступны.</p> : profile.premium_autorenew && profile.autorenew_amount != null ? (
              <p className="ui-secondary mt-5">Чтобы оплатить новый период вручную, сначала отключи текущее автопродление.</p>
            ) : <>
              <p className="ui-secondary text-sm mt-4">
                {purchaseTerms ? 'ЮKassa сохранит способ оплаты. О списании сообщим в Telegram не менее чем за сутки. Отключить продление можно в этом разделе.' : `Разовая оплата за ${premiumDays} дней доступа.`}
              </p>
              {profile.premium_autorenew && <label className="flex items-start gap-3 ui-secondary mt-4">
                <input type="checkbox" checked={autorenewAccepted} onChange={event => setAutorenewAccepted(event.target.checked)} disabled={!!busy || !!pending} className="ui-checkbox mt-px" />
                <span>Согласен на автоматическое списание {prices.premium} ₽ каждые {premiumDays} дней с сохранённого способа оплаты</span>
              </label>}
              {purchaseTerms && <p className="ui-secondary text-sm mt-2">Для автопродления через СБП нужен банк, который поддерживает автоплатежи.</p>}
              {consent}
              <CheckoutActions
                onPay={method => pay('premium', '/api/subscription/buy', purchaseTerms, method)}
                disabled={!offerAccepted || !!busy || !!pending}
                creating={busy === 'premium'}
              />
            </>}
          </>}
        </section>
        <section className="ui-card">
          <h3 className="text-lg font-semibold mb-3">Как получить услугу</h3>
          <DeliveryInformation premiumOnly={isPremium} />
          <details className="mt-5"><summary className="font-semibold py-2">Контакты и реквизиты</summary><div className="mt-3"><ContactInformation /></div></details>
        </section>
      </div>
      {isOfferOpen && <OfferPage onBack={() => setIsOfferOpen(false)} />}
    </Page>
  );
}

function CheckoutActions({ onPay, disabled, creating }) {
  return (
    <div className="flex flex-col gap-2" aria-busy={creating}>
      <button type="button" onClick={() => onPay('sbp')} disabled={disabled} className="ui-button ui-button--primary">
        Оплатить через СБП
      </button>
      <button type="button" onClick={() => onPay()} disabled={disabled} className="ui-button ui-button--outline">
        Другие способы оплаты
      </button>
      {creating && <p className="ui-secondary text-center" role="status">Создаю платёж…</p>}
    </div>
  );
}

function PendingNote({ url, onClose, canChangeAmount }) {
  const reopen = event => {
    if (!isTelegram) return;
    event.preventDefault();
    WebApp.openLink(url);
  };
  return <section className="ui-card">
    <p role="status" className="font-semibold">Ждём подтверждения оплаты</p>
    <p className="ui-secondary mt-2">Чтобы создать новый платёж, закрой прежнюю форму в браузере без оплаты.</p>
    <div className="flex flex-col gap-2 mt-4">
      {url && <a href={url} onClick={reopen} className="ui-button ui-button--primary">Вернуться к оплате</a>}
      <button type="button" onClick={onClose} className="ui-button ui-button--outline">
        {canChangeAmount ? 'Изменить сумму' : 'Выйти из оплаты'}
      </button>
    </div>
  </section>;
}

function Row({ label, value }) {
  return <div className="flex items-baseline justify-between gap-3 py-2 text-sm"><span className="text-[var(--ui-secondary)]">{label}</span><span className="font-semibold text-right shrink-0">{value}</span></div>;
}
