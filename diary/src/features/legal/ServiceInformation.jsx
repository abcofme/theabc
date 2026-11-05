import { useEffect, useState } from 'react';
import { BUSINESS } from './business';
import { formatTokens } from '../diary/utils';

export const SERVICE_DESCRIPTIONS = {
  diary_answer: 'Разбор записи дневника с помощью ИИ: взгляд на событие, эмоциональную реакцию и возможные следующие шаги.',
  report: 'Анализ записей дневника по выбранной теме: повторяющиеся события, реакции, энергия или компетентность.',
  portrait: 'Обобщение результатов пройденных психологических тестов с описанием особенностей личности. Цена указана за одно создание или обновление.',
  compatibility: 'Сравнение результатов тестов двух пользователей: особенности общения, сходства и различия.',
};
const LABELS = { diary_answer: 'Ответ дневника', report: 'Отчет', portrait: 'Портрет личности', compatibility: 'Анализ совместимости' };
const money = value => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;

export function ServiceInformation({ prices: suppliedPrices }) {
  const [loadedPrices, setLoadedPrices] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const prices = suppliedPrices || loadedPrices;

  useEffect(() => {
    if (suppliedPrices) return;
    const controller = new AbortController();
    fetch('/api/public/prices', { signal: controller.signal, credentials: 'omit', cache: 'no-cache' })
      .then(response => { if (!response.ok) throw new Error('Prices unavailable'); return response.json(); })
      .then(data => {
        const keys = ['premium', 'min_topup', 'tokens_per_ruble', ...Object.keys(SERVICE_DESCRIPTIONS)];
        if (!keys.every(key => Number.isFinite(data[key]) && data[key] > 0)) throw new Error('Invalid prices');
        if (!controller.signal.aborted) setLoadedPrices(data);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [suppliedPrices, attempt]);

  return <div className="ui-stack">
    <p className="ui-secondary">«Азбука Я» — личный дневник, психологические тесты и отчеты о себе. Прохождение тестов и ведение записей бесплатны. Функции с ИИ оплачиваются с баланса или входят в Premium.</p>
    {prices ? <>
      <section className="ui-card">
        <h3 className="text-lg font-semibold mb-2">Premium — {money(prices.premium)} за 30 дней</h3>
        <p className="ui-secondary">Все функции с ИИ без ограничений: ответы дневника, отчеты, портрет личности и анализ совместимости.</p>
        <p className="ui-secondary mt-3">Автопродление: {money(prices.premium)} каждые 30 дней. Отключить его можно в разделе «Подписка и баланс» кнопкой «Отменить автопродление». Доступ сохранится до конца оплаченного периода.</p>
      </section>
      <section className="ui-card">
        <h3 className="text-lg font-semibold mb-2">Оплата с баланса</h3>
        <p className="ui-secondary mb-4">Разовое пополнение от {money(prices.min_topup)}. За 1 ₽ начисляется {formatTokens(prices.tokens_per_ruble)}. Автоматических списаний при пополнении нет.</p>
        <div className="divide-y divide-[var(--ui-text)]/10">{Object.entries(SERVICE_DESCRIPTIONS).map(([key, description]) => <div key={key} className="py-3">
          <h4 className="font-semibold">{LABELS[key]} — {money(prices[key] / prices.tokens_per_ruble)} ({formatTokens(prices[key])})</h4>
          <p className="ui-secondary text-sm mt-1">{description}</p>
        </div>)}</div>
      </section>
    </> : <div role={error ? 'alert' : 'status'}>
      <p className="ui-secondary">{error ? 'Не удалось загрузить действующие цены.' : 'Загружаем цены…'}</p>
      {error && <button type="button" className="ui-button ui-button--outline mt-3" onClick={() => { setError(false); setAttempt(value => value + 1); }}>Повторить</button>}
    </div>}
    <section className="ui-card"><h3 className="text-lg font-semibold mb-2">Как получить услугу</h3><DeliveryInformation /></section>
  </div>;
}

export function DeliveryInformation() {
  return <div className="ui-secondary space-y-3">
    <p>Услуги предоставляются онлайн в приложении «Азбука Я» — в браузере и Telegram. В разделе «Подписка и баланс» выбери Premium или сумму пополнения, ознакомься с офертой и оплати через ЮKassa.</p>
    <p>После подтверждения успешной оплаты вернись в приложение: Premium активируется или токены зачисляются на баланс автоматически. Затем запусти нужную функцию.</p>
    <p>Ответ дневника появится в записи, отчеты и анализ совместимости — в разделе «Отчеты», портрет личности — в разделе «Профиль». Время формирования зависит от объема данных и загрузки сервиса. Доставка физических товаров не требуется.</p>
    <p>Если оплата прошла, а доступ не появился, напиши на <a className="underline underline-offset-4" href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>. Укажи аккаунт Telegram, дату, сумму и идентификатор платежа.</p>
  </div>;
}

export function ContactInformation() {
  return <div className="ui-secondary space-y-3">
    <p><strong className="text-[var(--ui-text)]">{BUSINESS.name}</strong><br />{BUSINESS.status}</p>
    <p><strong className="text-[var(--ui-text)]">ИНН:</strong> {BUSINESS.inn}</p>
    <p><strong className="text-[var(--ui-text)]">Электронная почта для обращений и поддержки:</strong><br /><a className="underline underline-offset-4" href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a></p>
    <p><strong className="text-[var(--ui-text)]">Телефон:</strong><br /><a className="underline underline-offset-4" href={`tel:${BUSINESS.phone.replace(/[^+\d]/g, '')}`}>{BUSINESS.phone}</a></p>
  </div>;
}
