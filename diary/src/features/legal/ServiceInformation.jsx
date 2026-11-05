import { BUSINESS } from './business';

export const SERVICE_DESCRIPTIONS = {
  diary_answer: 'Разбор записи дневника с помощью ИИ: взгляд на событие, эмоциональную реакцию и возможные следующие шаги.',
  report: 'Анализ записей дневника по выбранной теме: повторяющиеся события, реакции, энергия или компетентность.',
  portrait: 'Обобщение результатов пройденных психологических тестов с описанием особенностей личности. Цена указана за одно создание или обновление.',
  compatibility: 'Сравнение результатов тестов двух пользователей: особенности общения, сходства и различия.',
};
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
