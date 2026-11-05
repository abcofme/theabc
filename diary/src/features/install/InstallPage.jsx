import { useCallback, useEffect, useState } from 'react';
import { Check, Download, Send } from '../../components/ClayIcon';
import Page from '../../components/Page';
import { api } from '../../utils/api';
import {
  currentUser, getInstallPrompt, isIOS, isStandalone, isTelegram, onInstallPromptChange, promptInstall,
} from '../../utils/platform';

const WebApp = window.Telegram.WebApp;

const IOS_STEPS = [
  { title: 'Нажми «Поделиться»', hint: 'Квадрат со стрелкой внизу экрана, на iPad — вверху' },
  { title: 'Выбери «На экран „Домой“»', hint: 'Если пункта не видно, прокрути список вниз' },
  { title: 'Нажми «Добавить»', hint: 'Значок «Азбуки Я» появится на главном экране' },
];
const BROWSER_STEPS = [
  { title: 'Открой меню браузера', hint: 'Три точки в углу экрана или рядом с адресом' },
  { title: 'Выбери «Установить приложение»', hint: 'Или «Добавить на главный экран»' },
  { title: 'Подтверди установку', hint: 'Значок «Азбуки Я» появится среди приложений' },
];

// Установка на главный экран. В браузере — системное окно установки или подсказка по шагам,
// в Telegram — сначала переход в браузер по одноразовой ссылке, уже со входом
export default function InstallPage({ onBack }) {
  return (
    <Page title="Приложение на телефон" onBack={onBack}>
      <div className="ui-stack">
        <p className="ui-secondary">
          «Азбука Я» откроется с главного экрана в одно касание, как обычное приложение. {currentUser()?.auth_provider === 'password' ? 'Сохранятся записи, тесты и баланс твоего браузерного профиля.' : 'Аккаунт тот же: записи, тесты и баланс общие с Telegram.'}
        </p>
        {isTelegram ? <FromTelegram /> : isStandalone ? <Installed /> : <FromBrowser />}
      </div>
    </Page>
  );
}

function Steps({ steps }) {
  return (
    <ol className="portrait-path">
      {steps.map((step, index) => (
        <li key={step.title}>
          <span className="portrait-path__mark" aria-hidden="true">{index + 1}</span>
          <span className="min-w-0">
            <span className="block font-medium leading-6">{step.title}</span>
            <span className="ui-muted block">{step.hint}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Installed() {
  return (
    <section className="ui-card flex items-center gap-3">
      <Check size={24} className="shrink-0" />
      <p className="font-medium">Приложение уже установлено — ты в нем.</p>
    </section>
  );
}

// card=false — без своей карточки, для окна с предложением установить (InstallOffer.jsx)
export function FromBrowser({ card = true }) {
  const Wrapper = card ? 'section' : 'div';
  const wrapperClass = card ? 'ui-card' : undefined;
  const [canPrompt, setCanPrompt] = useState(() => Boolean(getInstallPrompt()));
  const [isInstalled, setIsInstalled] = useState(false);
  useEffect(() => onInstallPromptChange(() => setCanPrompt(Boolean(getInstallPrompt()))), []);

  const install = async () => {
    if (await promptInstall()) setIsInstalled(true);
  };

  if (isInstalled) {
    return (
      <Wrapper className={wrapperClass}>
        <h3 className="text-lg font-semibold mb-2">Готово</h3>
        <p className="ui-secondary">Значок «Азбуки Я» появится на главном экране. Если приложение попросит войти — нажми «Войти через Telegram».</p>
      </Wrapper>
    );
  }

  return (
    <Wrapper className={wrapperClass}>
      {canPrompt ? <>
        <h3 className="text-lg font-semibold mb-2">Установить в одно касание</h3>
        <p className="ui-secondary mb-5">Браузер спросит подтверждение, и значок появится на главном экране.</p>
        <button type="button" onClick={install} className="ui-button ui-button--primary"><Download size={20} aria-hidden="true" /> Установить приложение</button>
      </> : <>
        <h3 className="text-lg font-semibold">{isIOS ? 'Как добавить в Safari' : 'Как установить'}</h3>
        <Steps steps={isIOS ? IOS_STEPS : BROWSER_STEPS} />
        <p className="ui-muted">Если приложение попросит войти — нажми «Войти через Telegram», это займет пару секунд.</p>
      </>}
    </Wrapper>
  );
}

// Ссылка одноразовая: берем ее заранее (openLink должен идти сразу из нажатия) и после перехода — новую
function FromTelegram() {
  const [code, setCode] = useState(null);
  const [error, setError] = useState(null);
  const ios = WebApp.platform === 'ios';
  const android = WebApp.platform === 'android';

  const requestCode = useCallback(() => {
    api('/api/auth/handoff', { method: 'POST' })
      .then(data => { setCode(data.code); setError(null); })
      .catch(err => setError(err.message || 'Не удалось подготовить ссылку'));
  }, []);
  useEffect(() => { requestCode(); }, [requestCode]);

  const open = () => {
    const url = new URL(window.location.origin);
    url.searchParams.set('login', code);
    url.searchParams.set('tab', 'profile');
    url.searchParams.set('page', 'install');
    WebApp.openLink(url.toString());
    setCode(null);
    requestCode();
  };

  const steps = [
    { title: 'Открой дневник в браузере', hint: 'Вход выполнится сам — по ссылке ниже' },
    ios
      ? { title: 'Нажми «Поделиться» → «На экран „Домой“»', hint: 'Если страница открылась внутри Telegram, сначала открой ее в Safari' }
      : android
        ? { title: 'Нажми «Установить приложение»', hint: 'Или в меню браузера — «Добавить на главный экран»' }
        : { title: 'Установи приложение в браузере', hint: 'В Chrome и Edge — значок установки в адресной строке' },
  ];

  return (
    <section className="ui-card">
      <h3 className="text-lg font-semibold">Два шага</h3>
      <Steps steps={steps} />
      <button type="button" onClick={open} disabled={!code} className="ui-button ui-button--primary">
        <Send size={20} aria-hidden="true" /> {code ? 'Открыть в браузере' : 'Готовлю ссылку…'}
      </button>
      {error && <p className="ui-secondary text-center mt-3" role="alert">{error}</p>}
    </section>
  );
}
