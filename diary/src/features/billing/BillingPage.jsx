import { useState } from 'react';
import { Check, Sparkles, Wallet } from 'lucide-react';
import Page from '../../components/Page';
import Spinner from '../../components/Spinner';
import OfferPage from '../legal/OfferPage';
import { useProfile } from '../../context/profile';
import { api } from '../../utils/api';

const WebApp = window.Telegram.WebApp;

const QUICK_AMOUNTS = [100, 300, 500, 1000];

const FEATURE_PRICES = [
  ['diary_answer', 'Ответ дневника на запись'],
  ['report', 'Отчет'],
  ['portrait', 'Портрет личности'],
  ['compatibility', 'Анализ совместимости'],
];

const PREMIUM_BENEFITS = [
  'Ответы дневника на каждую запись',
  'Отчеты о повторяющихся событиях, реакциях, энергии и компетентности',
  'Портрет личности и его обновления',
  'Анализ совместимости с друзьями',
];

const formatDate = (iso) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

// Подписка и баланс — единственное место, где видны цены
export default function BillingPage({ onBack }) {
  const { profile, isPremium, refreshProfile } = useProfile();
  const [amount, setAmount] = useState('300');
  const [offerAccepted, setOfferAccepted] = useState(false);
  const [isOfferOpen, setIsOfferOpen] = useState(false);
  const [busy, setBusy] = useState(null); // 'topup' | 'premium' | 'cancel'

  if (!profile) {
    return <Page title="Подписка и баланс" onBack={onBack}><Spinner /></Page>;
  }

  const { prices, balance } = profile;
  const sum = Number(amount);
  const isAmountValid = Number.isInteger(sum) && sum >= prices.min_topup && sum <= prices.max_topup;

  const pay = async (kind, path, body) => {
    if (!offerAccepted) {
      WebApp.showAlert('Пожалуйста, примите условия публичной оферты');
      return;
    }
    setBusy(kind);
    try {
      const { url } = await api(path, { method: 'POST', body });
      WebApp.openLink(url);
    } catch (err) {
      WebApp.showAlert(err.message || 'Не удалось создать платеж');
    } finally {
      setBusy(null);
    }
  };

  const cancelAutoRenewal = () => {
    WebApp.showConfirm('Отменить автопродление Premium? Подписка будет действовать до конца оплаченного периода.', async (confirmed) => {
      if (!confirmed) return;
      setBusy('cancel');
      try {
        await api('/api/subscription/cancel', { method: 'POST' });
        await refreshProfile();
        WebApp.showAlert('Автопродление отменено.');
      } catch (err) {
        WebApp.showAlert(err.message || 'Не удалось отменить автопродление');
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <Page title="Подписка и баланс" onBack={onBack}>
      <div className="flex flex-col gap-4">
        {/* ТЕКУЩЕЕ СОСТОЯНИЕ */}
        <section className="bg-rose-900/80 rounded-3xl p-5">
          {isPremium ? (
            <>
              <div className="flex items-center gap-2 text-[#F5E6D3] font-bold text-lg mb-3">
                <Sparkles size={20} /> Premium активен
              </div>
              <Row label="Действует до" value={formatDate(profile.access_expires_at)} />
              <Row label="Автопродление" value={profile.has_active_subscription ? 'включено' : 'выключено'} />
              {profile.has_active_subscription && (
                <button
                  onClick={cancelAutoRenewal}
                  disabled={busy === 'cancel'}
                  className="mt-4 w-full py-3 border border-rose-500/30 text-rose-300 text-sm font-medium rounded-2xl disabled:opacity-50"
                >
                  {busy === 'cancel' ? 'Отмена…' : 'Отменить автопродление'}
                </button>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[#F5E6D3] font-bold text-lg mb-1">
                <Wallet size={20} /> Баланс: {balance} ₽
              </div>
              <p className="text-sm text-[#F5E6D3]/75 leading-relaxed">
                Баланс расходуется по мере использования функций с ИИ. Если функция не сработала, деньги возвращаются.
              </p>
            </>
          )}
        </section>

        {/* ЦЕНЫ */}
        <section className="bg-rose-900/60 rounded-3xl p-5">
          <h3 className="text-sm font-bold text-[#F5E6D3]/80 uppercase tracking-wider mb-3">Без подписки — с баланса</h3>
          {FEATURE_PRICES.map(([key, label]) => (
            <Row key={key} label={label} value={`${prices[key]} ₽`} />
          ))}
          <p className="text-xs text-[#F5E6D3]/60 mt-3">С Premium — без ограничений.</p>
        </section>

        {/* Оплата — после согласия с офертой */}
        <label className="flex items-start gap-3 px-1 cursor-pointer">
          <input
            type="checkbox"
            checked={offerAccepted}
            onChange={(e) => setOfferAccepted(e.target.checked)}
            className="mt-0.5 w-5 h-5 accent-emerald-700 shrink-0"
          />
          <span className="text-sm text-[#F5E6D3]/80">
            Я согласен с{' '}
            <button type="button" onClick={() => setIsOfferOpen(true)} className="text-emerald-500 underline underline-offset-2">
              публичной офертой
            </button>
            {' '}и правилами предоставления услуг
          </span>
        </label>

        {/* ПОПОЛНЕНИЕ */}
        <section className="bg-rose-900/60 rounded-3xl p-5">
          <h3 className="text-sm font-bold text-[#F5E6D3]/80 uppercase tracking-wider mb-3">Пополнить баланс</h3>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {QUICK_AMOUNTS.map(value => (
              <button
                key={value}
                onClick={() => setAmount(String(value))}
                className={`py-2 rounded-xl text-sm font-bold ${sum === value ? 'bg-[#F5E6D3] text-rose-950' : 'bg-rose-950/60 text-[#F5E6D3]'}`}
              >
                {value} ₽
              </button>
            ))}
          </div>
          <label className="text-xs text-[#F5E6D3]/70 block mb-1" htmlFor="topup-amount">
            Своя сумма, от {prices.min_topup} ₽
          </label>
          <input
            id="topup-amount"
            type="number"
            inputMode="numeric"
            min={prices.min_topup}
            max={prices.max_topup}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            className="w-full bg-rose-950 rounded-xl px-4 py-3 text-[#F5E6D3] focus:outline-none focus:ring-2 focus:ring-emerald-700"
          />
          <button
            onClick={() => pay('topup', '/api/balance/topup', { amount: sum })}
            disabled={!isAmountValid || busy === 'topup'}
            className="mt-3 w-full py-3.5 bg-emerald-800 disabled:bg-emerald-950/40 disabled:text-[#F5E6D3]/50 text-[#F5E6D3] font-bold rounded-2xl"
          >
            {busy === 'topup' ? 'Создаю платеж…' : isAmountValid ? `Пополнить на ${sum} ₽` : `Сумма от ${prices.min_topup} до ${prices.max_topup} ₽`}
          </button>
        </section>

        {/* PREMIUM */}
        {!isPremium && (
          <section className="bg-rose-900/60 rounded-3xl p-5">
            <h3 className="text-[#F5E6D3] font-bold text-lg flex items-center gap-2">
              <Sparkles size={18} /> Premium — {prices.premium} ₽ в месяц
            </h3>
            <p className="text-sm text-[#F5E6D3]/75 mt-1 mb-3">Все функции с ИИ без ограничений:</p>
            <ul className="flex flex-col gap-2 mb-4">
              {PREMIUM_BENEFITS.map(item => (
                <li key={item} className="flex gap-2 text-sm text-[#F5E6D3]/90">
                  <Check size={16} className="text-emerald-500 shrink-0 mt-0.5" /> {item}
                </li>
              ))}
            </ul>
            <button
              onClick={() => pay('premium', '/api/subscription/buy')}
              disabled={busy === 'premium'}
              className="w-full py-3.5 bg-emerald-800 disabled:opacity-50 text-[#F5E6D3] font-bold rounded-2xl"
            >
              {busy === 'premium' ? 'Создаю платеж…' : 'Оформить Premium'}
            </button>
          </section>
        )}

      </div>

      {isOfferOpen && <OfferPage onBack={() => setIsOfferOpen(false)} />}
    </Page>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center gap-3 py-1.5 text-sm">
      <span className="text-[#F5E6D3]/70">{label}</span>
      <span className="text-[#F5E6D3] font-bold text-right">{value}</span>
    </div>
  );
}
