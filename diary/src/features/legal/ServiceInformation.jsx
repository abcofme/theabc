import { BUSINESS } from './business';

export function DeliveryInformation({ premiumOnly = false }) {
  return <div className="ui-secondary space-y-3">
    {premiumOnly ? <p>Premium уже активен. Запускай нужную функцию в браузере или Telegram.</p> : <>
    <p>Услуги предоставляются онлайн в приложении «Азбука Я» в браузере и Telegram. Для оплаты открой раздел «Подписка и баланс», выбери Premium или сумму пополнения и ознакомься с офертой. Форма ЮKassa откроется в браузере.</p>
    <p>После подтверждения успешной оплаты вернись в приложение: Premium активируется или листики зачисляются на баланс автоматически. Затем запусти нужную функцию.</p>
    </>}
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
