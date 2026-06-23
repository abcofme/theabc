import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { User, ChevronDown, ChevronUp, Check, XCircle, X, ChevronLeft, Lock, Wand2, Trash2, Brain, Activity, Star, ShieldAlert, Sparkles, Target, Heart, Flame, ClipboardList, Users, ChevronRight } from 'lucide-react';
import AdminPanel from '../admin/AdminPanel';
import FriendsView from './FriendsView';
import qrCodeImg from '../../assets/qr-code.png';
import QRCode from 'react-qr-code';
import GenerationProgress from '../../components/GenerationProgress';

const WebApp = window.Telegram.WebApp;
const API_URL = window.location.origin;

const PUBLIC_OFFER_TEXT = `# Публичная оферта на оказание информационных услуг

Настоящий документ представляет собой официальное предложение (Публичную оферту) плательщика налога на профессиональный доход (самозанятого) **Селиванова Мартина Дмитриевича** (далее — «Исполнитель»), адресованное любому дееспособному физическому лицу (далее — «Пользователь»), заключить Договор возмездного оказания информационных услуг на изложенных ниже условиях.

В соответствии с пунктом 2 статьи 437 Гражданского Кодекса Российской Федерации (ГК РФ), в случае принятия изложенных ниже условий и оплаты услуг лицо, производящее акцепт этой оферты, становится Пользователем (в соответствии с пунктом 3 статьи 438 ГК РФ акцепт оферты равносилен заключению договора на условиях, изложенных в оферте).

## 1. Термины и определения
1.1. **Сервис** — Telegram-бот «Азбука Я» (и/или связанное с ним мини-приложение WebApp), предоставляющий доступ к психологическим тестам, профилированию и профориентации.
1.2. **Пользователь** — физическое лицо, осуществившее акцепт настоящей Оферты.
1.3. **Услуги** — предоставление Пользователю доступа к функционалу Сервиса на платной основе (подписка «Premium» и блок «Профориентация»).
1.4. **Акцепт Оферты** — полное и безоговорочное согласие Пользователя с условиями настоящей Оферты, выраженное путем осуществления оплаты Услуг.

## 2. Предмет договора
2.1. Исполнитель обязуется предоставить Пользователю доступ к платному функционалу Сервиса, а Пользователь обязуется оплатить эти услуги в порядке и на условиях, предусмотренных настоящей Офертой.
2.2. Услуги включают в себя предоставление доступа к расширенным психологическим тестам, алгоритмам анализа результатов и генерации профильных отчетов (в том числе профориентационных).
2.3. Услуги носят исключительно информационно-развлекательный и рекомендательный характер и не являются медицинскими, психиатрическими или профессиональными психологическими диагнозами.

## 3. Стоимость услуг и порядок расчетов
3.1. Доступ к Услугам осуществляется на условиях предварительной оплаты (100% предоплата).
3.2. В Сервисе предусмотрены следующие платные Услуги:

* **Подписка «Premium»** — предоставляется на основе регулярных (рекуррентных) платежей. Стоимость составляет 149 (сто сорок девять) рублей за 1 (один) месяц доступа.
* **Блок «Профориентация»** — предоставляется на основе разового платежа. Стоимость составляет 1499 (одна тысяча четыреста девяносто девять) рублей. Доступ предоставляется в полном объеме без ограничения по времени.

3.3. **Автоматическое продление (рекуррентные платежи):** При оформлении подписки «Premium» Пользователь соглашается с тем, что по истечении оплаченного периода (1 месяц) стоимость подписки за следующий период будет списываться с банковской карты Пользователя автоматически, без дополнительного подтверждения.
3.4. Пользователь вправе в любой момент отменить автоматическое продление подписки с помощью кнопки «Отменить подписку», расположенной в разделе «Профиль» внутри Сервиса. При отмене подписки доступ сохраняется до конца оплаченного периода.
3.5. Оплата осуществляется через платежный сервис (эквайринг ЮKassa). Исполнитель не хранит и не обрабатывает данные банковских карт Пользователя.

## 4. Порядок оказания услуг и возврат средств
4.1. Услуга по предоставлению доступа к блоку «Профориентация» считается оказанной Исполнителем в полном объеме и надлежащего качества в момент открытия Пользователю доступа к соответствующему разделу (цифровому контенту) в Сервисе. Поскольку Исполнитель предоставляет доступ к массиву информации единовременно и в полном объеме, обязательства Исполнителя считаются исполненными, а уплаченная сумма возврату не подлежит (в силу ст. 453 и ст. 782 ГК РФ, так как фактически понесенные расходы Исполнителя на предоставление доступа составляют 100% от стоимости услуги).
4.2. Услуга по предоставлению подписки «Premium» оказывается частями (посуточно) в течение всего оплаченного периода. При досрочном отказе Пользователя от подписки, возврат денежных средств за текущий оплаченный расчетный период (1 месяц) не производится, а доступ к Сервису сохраняется для Пользователя до окончания такого оплаченного периода. Данное условие обусловлено расходами Исполнителя на резервирование вычислительных мощностей и поддержание учетной записи Пользователя в активном состоянии.
4.3. Возврат денежных средств возможен исключительно в случаях технических сбоев на стороне Исполнителя, подтвержденных внутренней службой аналитики Сервиса, если оплаченная Услуга фактически не была предоставлена (доступ к функционалу не открылся в течение 24 часов с момента оплаты). Для оформления возврата Пользователь направляет мотивированное заявление на E-mail Исполнителя: info@abcofme.ru.

## 5. Права и обязанности сторон
5.1. **Исполнитель обязуется:**

* Предоставить Услуги после поступления оплаты.
* Обеспечивать круглосуточную доступность Сервиса (за исключением времени на техническое обслуживание).
* Сохранять конфиденциальность данных Пользователя.

5.2. **Пользователь обязуется:**

* Ознакомиться с условиями Оферты до момента оплаты.
* Не передавать доступ к своему аккаунту в Сервисе третьим лицам.
* Самостоятельно следить за статусом своей подписки и своевременно отключать ее при отсутствии необходимости в продлении.

## 6. Ответственность сторон
6.1. Исполнитель не несет ответственности за несоответствие предоставленных Услуг ожиданиям Пользователя и/или за его субъективную оценку.
6.2. Исполнитель не несет ответственности за любые прямые или косвенные убытки, возникшие в результате использования или невозможности использования Сервиса, включая принятие Пользователем каких-либо жизненных или карьерных решений на основе результатов тестов.
6.3. Пользователь принимает на себя полную ответственность за использование реферальной программы Сервиса (правила которой регулируются отдельным Соглашением).

## 7. Обработка персональных данных
7.1. Акцептуя Оферту, Пользователь дает согласие на обработку своих персональных данных (имя, Telegram ID, результаты тестов) в целях исполнения настоящего Договора.
7.2. Обработка персональных данных осуществляется Исполнителем в соответствии с Политикой конфиденциальности и законодательством РФ.

## 8. Прочие условия
8.1. Исполнитель оставляет за собой право вносить изменения в настоящую Оферту. Новая редакция вступает в силу с момента ее публикации в Сервисе.
8.2. Все споры и разногласия решаются путем переговоров. При недостижении согласия спор подлежит рассмотрению в суде в соответствии с действующим законодательством РФ.

## 9. Реквизиты Исполнителя
**Плательщик НПД (Самозанятый):** Селиванов Мартин Дмитриевич
**ИНН:** 772464349906
**E-mail для связи и поддержки:** info@abcofme.ru`;

export default function ProfileTab({ onOverlayOpen }) {
  const [categories, setCategories] = useState([]);
  const [totalTests, setTotalTests] = useState(0);
  const [passedTests, setPassedTests] = useState(0);
  const [portraitData, setPortraitData] = useState(null);
  const [isGeneratingPortrait, setIsGeneratingPortrait] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [accessLevel, setAccessLevel] = useState('');
  const [accessExpiresAt, setAccessExpiresAt] = useState(null);
  const [isBuying, setIsBuying] = useState(false);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  
  // Новый стейт для вкладок
  const [activeSubTab, setActiveSubTab] = useState('main'); // 'main' | 'admin' | 'portrait' | 'friends' | 'referral'

  // Хранит ID открытой категории (аккордеон)
  const [openCategory, setOpenCategory] = useState(null);
  
  // Хранит данные теста, по которому кликнули, для показа в модальном окне
  const [selectedResult, setSelectedResult] = useState(null);

  // Состояние для увеличения QR-кода
  const [isQrExpanded, setIsQrExpanded] = useState(false);
  
  // Состояния для реферальной программы
  const [referralInfo, setReferralInfo] = useState({ pending: 0, available: 0, referral_count: 0, link: '', inn_verified: false, inn: '' });
  const [innInput, setInnInput] = useState('');
  const [isVerifyingInn, setIsVerifyingInn] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // Premium modal states
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [isOfferAccepted, setIsOfferAccepted] = useState(false);
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);

  // Скрываем нижнее меню при открытии модалок
  useEffect(() => {
    onOverlayOpen?.(isPremiumModalOpen || isOfferModalOpen || !!selectedResult || isQrExpanded);
  }, [isPremiumModalOpen, isOfferModalOpen, selectedResult, isQrExpanded, onOverlayOpen]);

  // Получаем данные пользователя из Telegram (если открыто в браузере - ставим заглушку)
  const tgUser = WebApp.initDataUnsafe?.user || {
    first_name: "Пользователь",
    username: "username",
    photo_url: ""
  };

  // Загружаем данные с бэкенда при открытии вкладки
  useEffect(() => {
    if (WebApp.initData) {
      fetch(`${API_URL}/api/profile`, {
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      })
        .then(res => res.json())
        .then(data => {
          setCategories(data.categories || []);
          setTotalTests(data.total_tests || 0);
          setPassedTests(data.passed_tests || 0);
          setPortraitData(data.portrait || null);
          setAccessLevel(data.access_level);
          setAccessExpiresAt(data.access_expires_at);
          setHasActiveSubscription(data.has_active_subscription || false);
          setLoading(false);
        })
        .catch(err => {
          console.error("Profile fetch error", err);
          setLoading(false);
        });

      fetch(`${API_URL}/api/referral`, {
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      })
      .then(res => res.json())
      .then(data => {
        if (!data.error) setReferralInfo(data);
      })
      .catch(err => console.error("Referral fetch error:", err));
    } else {
      // Защита для локального тестирования
      setLoading(false);
    }
  }, []);

  const handleGeneratePortrait = async () => {
    if (portraitData && portraitData.tests_count >= passedTests) {
      WebApp.showAlert("У вас нет новых пройденных тестов для обновления портрета.");
      return;
    }
    setIsGeneratingPortrait(true);
    try {
      const response = await fetch(`${API_URL}/api/portrait/generate`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Неизвестная ошибка сервера");
      }
      if (data.detail) {
        throw new Error(data.detail);
      }
      if (data.status === "error") {
        throw new Error(data.message || "Неизвестная ошибка сервера");
      }
      setPortraitData(data.portrait);
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch (error) {
      console.error(error);
      WebApp.showAlert(`Произошла ошибка при генерации портрета: ${error.message}`);
    } finally {
      setIsGeneratingPortrait(false);
    }
  };

  const handleClearPortrait = async () => {
    try {
      const response = await fetch(`${API_URL}/api/portrait/clear`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      });
      if (response.ok) {
        setPortraitData(null);
        WebApp.showAlert("Портрет успешно удален");
      }
    } catch (err) {
      console.error(err);
      setIsBuying(false);
    }
  }

  const handleCancelSubscription = async () => {
    if (!WebApp.initData) return;
    
    WebApp.showConfirm("Вы уверены, что хотите отменить автопродление Premium подписки? Текущая подписка будет действовать до конца оплаченного периода.", async (confirmed) => {
      if (!confirmed) return;
      
      setIsCancelling(true);
      try {
        const res = await fetch(`${API_URL}/api/subscription/cancel`, {
          method: 'POST',
          headers: { "Authorization": `Bearer ${WebApp.initData}` }
        });
        const result = await res.json();
        if (result.status === 'success') {
          setHasActiveSubscription(false);
          WebApp.showAlert("Автопродление подписки успешно отменено.");
        } else {
          WebApp.showAlert("Ошибка при отмене подписки.");
        }
      } catch (err) {
        console.error(err);
        WebApp.showAlert("Произошла ошибка.");
      } finally {
        setIsCancelling(false);
      }
    });
  };

  const handleVerifyInn = async () => {
    if (!innInput || (innInput.length !== 10 && innInput.length !== 12)) {
      WebApp.showAlert("ИНН должен состоять из 10 или 12 цифр");
      return;
    }
    setIsVerifyingInn(true);
    try {
      const response = await fetch(`${API_URL}/api/referral/verify_inn`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WebApp.initData}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inn: innInput })
      });
      const data = await response.json();
      if (response.ok) {
        WebApp.showAlert("ИНН успешно подтвержден!");
        setReferralInfo(prev => ({...prev, inn_verified: true, inn: innInput}));
      } else {
        WebApp.showAlert(`Ошибка: ${data.detail || "Неизвестная ошибка"}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsVerifyingInn(false);
    }
  };

  const buyPremium = async () => {
    setIsBuying(true);
    try {
      const response = await fetch(`${API_URL}/api/subscription/buy`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WebApp.initData}`,
          "Content-Type": "application/json"
        }
      });
      const data = await response.json();
      if (response.ok) {
        WebApp.openLink(data.url);
      } else {
        WebApp.showAlert(`Ошибка: ${data.detail || "Не удалось создать платеж"}`);
      }
    } catch (err) {
      WebApp.showAlert(`Ошибка сети: ${err.message}`);
    } finally {
      setIsBuying(false);
    }
  };

  const handleWithdraw = async () => {
    setIsWithdrawing(true);
    try {
      const response = await fetch(`${API_URL}/api/referral/withdraw`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WebApp.initData}`,
          "Content-Type": "application/json"
        }
      });
      const data = await response.json();
      if (response.ok) {
        WebApp.showAlert("Средства успешно отправлены!");
        setReferralInfo(prev => ({...prev, available: 0}));
      } else {
        WebApp.showAlert(`Ошибка: ${data.detail || "Неизвестная ошибка"}`);
      }
    } catch (err) {
      WebApp.showAlert(`Ошибка сети: ${err.message}`);
    } finally {
      setIsWithdrawing(false);
    }
  };

  let markdownContent = portraitData ? portraitData.content : "";
  if (portraitData && markdownContent) {
    if (!markdownContent.includes("```json")) {
      // Find the raw array and wrap it in ```json ... ```
      markdownContent = markdownContent.replace(/(\[\s*\{[\s\S]*"leftValue"[\s\S]*\}\s*\])/, "```json\n$1\n```");
    }
  }

  const PortraitScale = ({ left, right, leftValue, rightValue, description }) => (
    <div className="mb-10 w-full">
      <div className="flex justify-between text-base sm:text-lg font-bold text-[#F5E6D3] mb-3">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <div className="h-4 w-full bg-rose-800 rounded-full overflow-hidden flex shadow-inner mb-4">
        <div className="h-full bg-green-700 transition-all duration-1000 ease-out" style={{ width: `${leftValue}%` }}></div>
        <div className="h-full bg-orange-500 transition-all duration-1000 ease-out" style={{ width: `${rightValue}%` }}></div>
      </div>
      {description && <div className="mt-4"><p className="text-sm sm:text-base text-[#F5E6D3] font-medium leading-relaxed block break-words whitespace-pre-wrap">{description}</p></div>}
    </div>
  );

  const getMarkdownComponents = (sectionTitle) => {
    let IconComponent = Sparkles;
    let iconColor = "text-[#F5E6D3]";

    if (sectionTitle.includes('Поведенческие')) {
      IconComponent = Target;
      iconColor = "text-[#F5E6D3]";
    } else if (sectionTitle.includes('ценностей')) {
      IconComponent = Heart;
      iconColor = "text-[#F5E6D3]";
    } else if (sectionTitle.includes('барьеры')) {
      IconComponent = Flame;
      iconColor = "text-[#F5E6D3]";
    }

    return {
      h1: ({node, ...props}) => (
        <h1 className="text-3xl sm:text-4xl font-black text-[#F5E6D3] text-center mb-10 mt-6 first:mt-2 uppercase drop-shadow-sm break-words" {...props} />
      ),
      h2: ({node, ...props}) => {
        let textStr = "";
        if (typeof props.children === 'string') textStr = props.children;
        else if (Array.isArray(props.children)) textStr = props.children.map(c => typeof c === 'string' ? c : '').join('');
        
        let h2Icon = null;
        if (textStr.includes('Устойчивые')) h2Icon = <Activity className="text-[#F5E6D3] inline mb-1 mr-3" size={28} />;
        else if (textStr.includes('Поведенческие')) h2Icon = <Brain className="text-[#F5E6D3] inline mb-1 mr-3" size={28} />;
        else if (textStr.includes('ценностей')) h2Icon = <Star className="text-[#F5E6D3] inline mb-1 mr-3" size={28} />;
        else if (textStr.includes('барьеры')) h2Icon = <ShieldAlert className="text-[#F5E6D3] inline mb-1 mr-3" size={28} />;
        else if (textStr.includes('Личность')) h2Icon = <User className="text-[#F5E6D3] inline mb-1 mr-3" size={28} />;

        return <h2 className="text-2xl sm:text-3xl font-bold text-[#F5E6D3] mt-14 mb-8 flex items-center justify-center pb-4 break-words text-center">{h2Icon} {props.children}</h2>
      },
      p: ({node, ...props}) => <p className="text-[#F5E6D3] leading-loose mb-8 text-base sm:text-lg font-semibold text-left break-words" {...props} />,
      strong: ({node, ...props}) => (
        <strong className="text-[#F5E6D3] font-black text-lg sm:text-xl break-words" {...props}>
          <IconComponent className={`inline ${iconColor} mb-1 mr-2`} size={22} />
          {props.children}
        </strong>
      ),
      ul: ({node, ...props}) => {
        return <ul className="space-y-6 mb-10 mt-6 pl-1 w-full" {...props} />
      },
      li: ({node, ...props}) => {
        const isBarriers = sectionTitle.includes('барьеры');
        return (
          <li className={`flex items-start text-base sm:text-lg font-semibold text-[#F5E6D3] break-words w-full ${isBarriers ? ' pb-4 last:' : ''}`}>
            <IconComponent className={`shrink-0 ${iconColor} mr-3 mt-1`} size={22} />
            <span className="flex-1 block">{props.children}</span>
          </li>
        );
      },
      code: ({node, inline, className, children, ...props}) => {
        const match = /language-(\w+)/.exec(className || '')
        if (!inline && match && match[1] === 'json') {
          const jsonString = String(children).replace(/\n$/, '');
          let scalesData = [];
          try {
            const parsed = JSON.parse(jsonString);
            if (Array.isArray(parsed)) {
              scalesData = parsed;
            } else if (parsed && typeof parsed === 'object') {
              if (Array.isArray(parsed.scales)) {
                scalesData = parsed.scales;
              } else if (Array.isArray(parsed.data)) {
                scalesData = parsed.data;
              } else {
                const arr = Object.values(parsed).find(v => Array.isArray(v));
                if (arr) scalesData = arr;
              }
            }
          } catch (e) {
            return <code className={className} {...props}>{children}</code>;
          }
          
          if (!Array.isArray(scalesData)) {
            scalesData = [];
          }
          
          return (
            <div className="my-10 px-2 sm:px-4">
              {scalesData.map((s, idx) => (
                <PortraitScale key={idx} left={s.left || ''} right={s.right || ''} leftValue={s.leftValue || 50} rightValue={s.rightValue || 50} description={s.description || ''} />
              ))}
            </div>
          )
        }
        return <code className="bg-rose-800 text-[#F5E6D3] px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>
      }
    };
  };

  return (
    <div className="flex flex-col relative select-none bg-transparent max-w-2xl mx-auto w-full">
      {/* 1. ШАПКА ПРОФИЛЯ (Аватар и Юзернейм) */}
      <div className="flex items-center gap-4 p-4 sm:p-6 bg-rose-900/80 rounded-3xl mx-2 mt-2 mb-4 backdrop-blur-sm shadow-sm">
        {tgUser.photo_url ? (
          <img src={tgUser.photo_url} alt="Avatar" className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover shadow-lg" />
        ) : (
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-green-950/40 text-[#F5E6D3] rounded-full flex items-center justify-center font-bold text-2xl shadow-inner">
            {tgUser.first_name?.[0] || <User size={32} />}
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <h2 className="text-xl sm:text-2xl font-bold text-[#F5E6D3] truncate">{tgUser.first_name}</h2>
          <p className="text-sm sm:text-base text-[#F5E6D3] font-medium truncate">@{tgUser.username}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`font-bold px-2 py-1 rounded-xl text-xs sm:text-sm text-center ${
            accessLevel === 'Premium' ? 'bg-amber-500 text-rose-950' : 
            accessLevel === 'Демо-доступ' ? 'bg-green-500/20 text-green-300' : 'bg-rose-950 text-[#F5E6D3]/60'
          }`}>
            {accessLevel || 'Загрузка...'}
          </span>
          {accessExpiresAt && (
             <span className="text-[10px] text-[#F5E6D3]/60">До {new Date(accessExpiresAt).toLocaleDateString()}</span>
          )}
        </div>
      </div>



      {activeSubTab === 'admin' && (
        <AdminPanel onBack={() => setActiveSubTab('main')} />
      )}

      {activeSubTab === 'main' && (
        <>
          {/* КНОПКА ОФОРМЛЕНИЯ ПРЕМИУМ */}
          {!loading && accessLevel !== 'Premium' && (
            <div className="mx-2 mb-4">
              <button
                onClick={() => setIsPremiumModalOpen(true)}
                disabled={isBuying}
                className="w-full py-3.5 bg-green-800 hover:bg-green-700 text-[#F5E6D3] font-bold rounded-2xl shadow-sm transition-colors flex justify-center items-center gap-2"
              >
                {isBuying ? <span className="animate-spin text-xl">⏳</span> : <Sparkles size={18} />}
                Оформить Premium (149 ₽ / мес)
              </button>
            </div>
          )}
          {/* ПОРТРЕТ ЛИЧНОСТИ КНОПКИ */}
          <div className="mx-2 mb-4 flex flex-col gap-4">
            {!portraitData ? (
              <button 
                onClick={() => {
                  if (!(totalTests > 0 && passedTests === totalTests)) {
                    WebApp.showAlert("Пройдите все тесты, чтобы сформировать портрет личности.");
                    return;
                  }
                  handleGeneratePortrait();
                }}
                disabled={isGeneratingPortrait}
                className={`w-full rounded-2xl p-4 min-h-[88px] text-left transition-all duration-300 flex items-center justify-between shadow-sm backdrop-blur-sm ${
                  (totalTests > 0 && passedTests === totalTests) 
                    ? "bg-rose-900/80 hover:bg-rose-800/80 text-[#F5E6D3] active:scale-[0.98]" 
                    : "bg-rose-900/80 hover:bg-rose-800/80 text-[#F5E6D3]"
                }`}
              >
                <div>
                  <h3 className="text-lg font-bold mb-1">Сформировать портрет</h3>
                  <p className="text-sm text-[#F5E6D3]/80">
                    {isGeneratingPortrait ? 'Генерация...' : (totalTests > 0 && passedTests === totalTests) ? 'Анализ ваших тестов' : `Пройдено ${passedTests} из ${totalTests} тестов`}
                  </p>
                </div>
                {isGeneratingPortrait ? (
                  <div className="w-6 h-6 rounded-full animate-spin border-2 border-[#F5E6D3] border-t-transparent"></div>
                ) : (
                  <Wand2 size={24} className="text-[#F5E6D3]" />
                )}
              </button>
            ) : (
              <>
                {passedTests > portraitData.tests_count && (totalTests > 0 && passedTests === totalTests) && (
                  <button 
                    onClick={handleGeneratePortrait}
                    disabled={isGeneratingPortrait}
                    className="w-full bg-rose-900/80 rounded-2xl p-4 min-h-[88px] text-left hover:bg-rose-800/80 transition-all duration-300 active:scale-[0.98] flex items-center justify-between shadow-sm backdrop-blur-sm"
                  >
                    <div>
                      <h3 className="text-lg font-bold text-[#F5E6D3] mb-1">Сформировать заново</h3>
                      <p className="text-sm text-[#F5E6D3]/80">{isGeneratingPortrait ? 'Генерация...' : 'Обновить на основе новых тестов'}</p>
                    </div>
                    {isGeneratingPortrait ? (
                      <div className="w-6 h-6 rounded-full animate-spin border-2 border-[#F5E6D3] border-t-transparent"></div>
                    ) : (
                      <Wand2 className="text-[#F5E6D3]" size={24} />
                    )}
                  </button>
                )}
                <button 
                  onClick={() => setActiveSubTab('portrait')}
                  className="w-full bg-rose-900/80 rounded-2xl p-4 min-h-[88px] text-left hover:bg-rose-800/80 transition-all duration-300 active:scale-[0.98] flex items-center justify-between shadow-sm backdrop-blur-sm"
                >
                  <div className="text-left">
                    <h3 className="text-lg font-bold text-[#F5E6D3] mb-1">Мой портрет личности</h3>
                    <p className="text-sm text-[#F5E6D3]/80">Подробный анализ ваших черт характера</p>
                  </div>
                  <ClipboardList className="text-[#F5E6D3]" size={24} />
                </button>

              </>
            )}

            {/* ВНЕ ЗАВИСИМОСТИ ОТ ПОРТРЕТА */}
            <button 
              onClick={() => setActiveSubTab('friends')}
              className="w-full bg-rose-900/80 rounded-2xl p-4 min-h-[88px] text-left hover:bg-rose-800/80 transition-all duration-300 active:scale-[0.98] flex items-center justify-between shadow-sm backdrop-blur-sm"
            >
              <div>
                <h3 className="text-lg font-bold text-[#F5E6D3] mb-1">Друзья</h3>
                <p className="text-sm text-[#F5E6D3]/80">Узнайте совместимость с вашим другом или партнером!</p>
              </div>
              <Users className="text-[#F5E6D3]" size={24} />
            </button>

            {/* QR CODE BLOCK */}
            <div className="bg-rose-900/40 rounded-3xl p-6 flex flex-col items-center justify-center text-center">
              <h3 className="text-[#F5E6D3] font-bold text-lg mb-2">Поделиться</h3>
              <p className="text-[#F5E6D3]/70 text-sm mb-4">Отсканируйте QR-код, чтобы пригласить друзей или открыть приложение на другом устройстве</p>
              <div 
                className="p-2 rounded-2xl shadow-lg cursor-pointer hover:scale-105 transition-transform" 
                style={{backgroundColor: '#541515'}}
                onClick={() => setIsQrExpanded(true)}
              >
                <img src={qrCodeImg} alt="QR Code" className="w-36 h-36 object-contain rounded-xl" />
              </div>
            </div>

            {/* Referral Program Button */}
            <button
              onClick={() => setActiveSubTab('referral')}
              className="w-full bg-rose-900/80 rounded-2xl p-4 text-left hover:bg-rose-800/80 transition-all duration-300 active:scale-[0.98] flex items-center justify-between shadow-sm backdrop-blur-sm mt-4"
            >
              <div className="flex items-center gap-3">
                <Users className="text-[#F5E6D3]" size={24} />
                <h3 className="text-lg font-bold text-[#F5E6D3]">Реферальная программа</h3>
              </div>
              <ChevronRight className="text-[#F5E6D3]" size={20} />
            </button>

            {['ingenfrid', 'key_crp', 'fondlife'].includes(tgUser.username) && (
              <button 
                onClick={() => setActiveSubTab('admin')}
                className="w-full py-3 bg-green-800 hover:bg-green-700 text-[#F5E6D3] text-sm font-bold rounded-2xl transition-colors shadow-sm flex items-center justify-center gap-2 mt-4"
              >
                Админ-панель
              </button>
            )}

            {hasActiveSubscription && (
              <button
                onClick={handleCancelSubscription}
                disabled={isCancelling}
                className="w-full py-3 bg-transparent border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 hover:border-rose-500/50 text-sm font-medium rounded-2xl transition-colors flex items-center justify-center gap-2 mt-4"
              >
                {isCancelling ? <span className="animate-spin text-xl">⏳</span> : <XCircle size={16} />}
                Отменить подписку
              </button>
            )}

          </div>
        </>
      )}

      {activeSubTab === 'portrait' && (
        <div className="px-2 sm:px-4 pt-0 animate-in fade-in slide-in-from-right-8 duration-300 flex flex-col">
          <button 
            onClick={() => setActiveSubTab('main')}
            className="flex items-center gap-2 text-[#F5E6D3] hover:text-[#F5E6D3] mb-4 mx-2 transition-colors self-start"
          >
            <ChevronLeft size={20} />
            <span className="font-medium">Назад</span>
          </button>

          {isGeneratingPortrait ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 px-4">
              <GenerationProgress text="Портрет личности формируется..." />
            </div>
          ) : (
            <div className="flex flex-col">
              {portraitData && portraitData.tests_count < totalTests && (
                <div className="mb-4 mx-2 bg-rose-900/80 p-6 rounded-3xl text-center">
                  <p className="text-[#F5E6D3] text-sm mb-4 font-medium">Добавлены новые тесты! После прохождения вы можете сформировать новый портрет личности</p>
                  {passedTests < totalTests ? (
                    <button disabled className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-rose-800 text-[#F5E6D3] font-bold cursor-not-allowed">
                      <Lock size={18} /> Мой портрет личности
                    </button>
                  ) : (
                    <button onClick={handleGeneratePortrait} className="w-full flex items-center justify-center gap-2 bg-green-800 hover:bg-green-700 text-[#F5E6D3] font-bold py-4 rounded-2xl transition-colors active:scale-[0.98] shadow-lg shadow-green-900/40">
                      <ClipboardList size={18} /> Мой портрет личности
                    </button>
                  )}
                </div>
              )}

              {portraitData && (
                <div className="bg-rose-900/80 rounded-3xl p-5 sm:p-8 mb-4 mx-2 shadow-xl backdrop-blur-sm overflow-x-hidden">
                  {markdownContent.split(/(?=^#\s)/m).map((sectionText, i) => {
                    if (!sectionText.trim()) return null;
                    const firstLine = sectionText.trim().split('\n')[0];
                    
                    return (
                      <ReactMarkdown key={i} components={getMarkdownComponents(firstLine)}>
                        {sectionText}
                      </ReactMarkdown>
                    );
                  })}
                </div>
              )}

              {totalTests > 0 && passedTests < totalTests && !portraitData && (
                <div className="flex flex-col items-center text-center mt-auto bg-rose-900/80 p-6 rounded-3xl">
                  <p className="text-[#F5E6D3] text-sm mb-6">Чтобы сформировать портрет личности, пройдите все тесты.</p>
                  <button disabled className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-rose-800 text-[#F5E6D3] font-bold cursor-not-allowed">
                    <Lock size={18} /> Мой портрет личности
                  </button>
                </div>
              )}

                {totalTests > 0 && passedTests === totalTests && !portraitData && (
                  <div className="mt-auto">
                    <button onClick={handleGeneratePortrait} className="w-full flex items-center justify-center gap-2 bg-green-800 hover:bg-green-700 text-[#F5E6D3] font-bold py-4 rounded-2xl transition-colors active:scale-[0.98] shadow-lg shadow-green-900/40">
                      <ClipboardList size={18} /> Мой портрет личности
                    </button>
                  </div>
                )}
  
              {portraitData && (
                <button 
                  onClick={handleClearPortrait}
                  className="mt-4 flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-red-900/10 text-[#F5E6D3] hover:bg-red-900/30 transition-colors font-medium text-sm active:scale-[0.98]"
                >
                  <Trash2 size={18} /> Удалить портрет
                </button>
              )}
              
            </div>
          )}
        </div>
      )}

      {/* 4. ВСПЛЫВАЮЩЕЕ ОКНО С РЕЗУЛЬТАТОМ ТЕСТА */}
      {selectedResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-rose-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          {/* Область клика вокруг окна для закрытия */}
          <div className="absolute inset-0" onClick={() => setSelectedResult(null)}></div>
          <div className="relative bg-rose-900 rounded-[2rem] w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300">

            {/* Текст результата */}
            <div className="p-5 sm:p-6 overflow-y-auto">
              <div className="text-[#F5E6D3] text-sm sm:text-base leading-relaxed whitespace-pre-wrap">
                {selectedResult.result_text || 'Нет детального описания результата.'}
              </div>
            </div>
            {/* Нижняя кнопка */}
            <div className="p-4 sm:p-5 bg-rose-950/50 rounded-b-[2rem]">
              <button onClick={() => setSelectedResult(null)} className="w-full bg-green-800 hover:bg-green-700 text-[#F5E6D3] font-bold py-3.5 rounded-xl transition-all active:bg-green-900 shadow-lg shadow-green-950/20">
                Отлично
              </button>
            </div>
          </div>
        </div>
      )}
    
      {activeSubTab === 'friends' && (
        <FriendsView onBack={() => setActiveSubTab('main')} />
      )}

      {/* 5. ВСПЛЫВАЮЩЕЕ ОКНО С QR КОДОМ */}
      {isQrExpanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-rose-950/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="absolute inset-0" onClick={() => setIsQrExpanded(false)}></div>
          <div className="relative flex flex-col items-center animate-in zoom-in-95 duration-300 max-w-sm w-full">
            <button onClick={() => setIsQrExpanded(false)} className="absolute -top-12 right-0 flex items-center gap-2 p-2 text-[#F5E6D3] hover:text-white transition-colors">
              <span className="font-medium text-lg">Закрыть</span>
              <X size={28} />
            </button>
            <div className="p-4 rounded-3xl shadow-2xl bg-[#541515] w-full aspect-square">
              <img src={qrCodeImg} alt="QR Code Expanded" className="w-full h-full object-contain rounded-2xl" />
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'referral' && (
        <div className="px-4 sm:px-6 pt-6 animate-in fade-in slide-in-from-right-8 duration-300 flex flex-col">
          <button 
            onClick={() => setActiveSubTab('main')}
            className="flex items-center gap-2 text-[#F5E6D3] hover:text-[#F5E6D3] mb-6 transition-colors self-start"
          >
            <ChevronLeft size={20} />
            <span className="font-medium">Назад</span>
          </button>
          
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-[#F5E6D3] mb-2 flex items-center gap-2">
              <Users className="text-green-600" />
              Реферальная программа
            </h2>
            <p className="text-[#F5E6D3]/70">Приглашайте друзей и получайте 50% от их оплат на свой баланс.</p>
          </div>
          
          {!referralInfo.inn_verified ? (
            <div className="bg-rose-900/80 backdrop-blur-sm rounded-3xl p-5 mb-10 shadow-lg">
              <div className="text-[#F5E6D3] font-bold mb-4">Для доступа требуется статус самозанятого</div>
              <p className="text-[#F5E6D3]/70 text-sm mb-4">
                По закону РФ мы осуществляем выплаты только плательщикам НПД (самозанятым).
                Введите ваш ИНН для автоматической проверки в ФНС.
              </p>
              <div className="flex flex-col gap-3">
                <input 
                  type="text" 
                  placeholder="Ваш ИНН (10 или 12 цифр)" 
                  value={innInput}
                  onChange={(e) => setInnInput(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  className="w-full bg-[#2B0A0A] rounded-xl px-4 py-3 text-[#F5E6D3] placeholder:text-[#F5E6D3]/30 outline-none transition-colors"
                />
                <button 
                  onClick={handleVerifyInn}
                  disabled={isVerifyingInn || innInput.length < 10}
                  className="w-full bg-green-800 hover:bg-green-700 disabled:opacity-50 disabled:bg-gray-600 text-[#F5E6D3] font-bold py-3.5 rounded-xl transition-colors shadow-lg shadow-green-950/20"
                >
                  {isVerifyingInn ? "Проверка..." : "Проверить ИНН"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-rose-900/80 backdrop-blur-sm rounded-3xl p-5 mb-6 shadow-lg">
                <div className="flex flex-col gap-4">
                  <div className="bg-[#2B0A0A] p-4 rounded-2xl flex justify-between items-center">
                    <div>
                      <div className="text-[#F5E6D3]/70 text-sm mb-1">Сумма в ожидании</div>
                      <div className="text-[#F5E6D3] text-2xl font-bold">{referralInfo.pending} ₽</div>
                    </div>
                    <Activity className="text-green-600 opacity-50" size={32} />
                  </div>
                  <div className="bg-[#2B0A0A] p-4 rounded-2xl flex justify-between items-center">
                    <div>
                      <div className="text-[#F5E6D3]/70 text-sm mb-1">Доступно к выводу</div>
                      <div className="text-[#F5E6D3] text-2xl font-bold">{referralInfo.available} ₽</div>
                    </div>
                    <Check className="text-green-600" size={32} />
                  </div>
                </div>
                <div className="mt-4 p-3 bg-rose-950/30 rounded-xl text-xs text-[#F5E6D3]/60 flex gap-2">
                  <ShieldAlert className="shrink-0 text-green-500/80" size={16} />
                  <span>Внимание! Баланс переходит в статус «Доступно к выводу» 1 числа каждого месяца. Выплаты осуществляются как самозанятому (ИНН: {referralInfo.inn}).</span>
                </div>
              </div>
              
              <div className="bg-rose-900/80 backdrop-blur-sm rounded-3xl p-5 mb-6 shadow-lg flex flex-col items-center">
                <div className="text-[#F5E6D3] font-bold mb-4">Ваш уникальный QR-код</div>
                <div className="bg-white p-4 rounded-2xl mb-4">
                  {referralInfo.link && (
                    <QRCode value={referralInfo.link} size={150} level="M" />
                  )}
                </div>
                <div className="w-full">
                  <div className="text-[#F5E6D3]/70 text-xs mb-1 ml-1">Ваша ссылка:</div>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      readOnly 
                      value={referralInfo.link} 
                      className="flex-1 bg-[#2B0A0A] rounded-xl px-3 py-2 text-sm text-[#F5E6D3] outline-none"
                    />
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(referralInfo.link);
                        WebApp.showAlert("Ссылка скопирована!");
                      }}
                      className="bg-green-800 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                    >
                      Копировать
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="bg-rose-900/80 backdrop-blur-sm rounded-3xl p-5 mb-10 shadow-lg">
                <div className="text-[#F5E6D3] font-bold mb-4">Вывод средств (от 100 рублей)</div>
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={handleWithdraw}
                    disabled={isWithdrawing || referralInfo.available < 100}
                    className="w-full bg-green-800 hover:bg-green-700 disabled:opacity-50 disabled:bg-gray-600 text-[#F5E6D3] font-bold py-3.5 rounded-xl transition-colors shadow-lg shadow-green-950/20"
                  >
                    {isWithdrawing ? "Обработка..." : "Запросить вывод"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 6. ПРЕМИУМ МОДАЛКА */}
      {isPremiumModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-rose-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="absolute inset-0" onClick={() => setIsPremiumModalOpen(false)}></div>
          <div className="relative bg-rose-900 w-full max-w-2xl rounded-t-[2rem] p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-full duration-300">
            <button onClick={() => setIsPremiumModalOpen(false)} className="absolute top-4 right-4 p-2 text-[#F5E6D3]/60 hover:text-[#F5E6D3] bg-rose-950/50 rounded-full transition-colors">
              <X size={20} />
            </button>
            <div className="text-center mb-6 mt-2">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/20 text-green-400 rounded-full mb-4 shadow-[0_0_20px_rgba(34,197,94,0.2)]">
                <Sparkles size={32} />
              </div>
              <h2 className="text-2xl font-bold text-[#F5E6D3]">Оформить Premium</h2>
              <p className="text-green-500/90 font-medium text-sm mt-1">149 ₽ в месяц</p>
            </div>
            
            <div className="bg-rose-950/50 rounded-2xl p-5 mb-6">
              <p className="text-[#F5E6D3] text-sm leading-relaxed mb-4">
                С подпиской Premium вы получите:
                <br />✨ Генерацию детализированных отчетов
                <br />✨ Шкалу соответствия ваших реакций портрету личности
                <br />✨ И многое другое!
              </p>
              
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center mt-0.5">
                  <input 
                    type="checkbox" 
                    className="peer appearance-none w-5 h-5 border-2 border-rose-800 rounded-md checked:bg-green-800 checked:border-green-800 transition-colors"
                    checked={isOfferAccepted}
                    onChange={(e) => setIsOfferAccepted(e.target.checked)}
                  />
                  <Check size={14} className="absolute text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                </div>
                <span className="text-[#F5E6D3]/80 text-sm select-none">
                  Я согласен с <button onClick={(e) => {e.preventDefault(); setIsOfferModalOpen(true);}} className="text-green-600 hover:text-green-500 underline underline-offset-2">публичной офертой</button> и правилами предоставления услуг.
                </span>
              </label>
            </div>
            
            <button
              onClick={() => {
                if (!isOfferAccepted) {
                  WebApp.showAlert("Пожалуйста, примите условия публичной оферты");
                  return;
                }
                buyPremium();
              }}
              disabled={isBuying}
              className={`w-full py-4 text-[#F5E6D3] font-bold rounded-xl shadow-lg transition-all flex justify-center items-center gap-2 ${
                isOfferAccepted 
                  ? "bg-green-800 hover:bg-green-700 shadow-green-900/30" 
                  : "bg-green-900/40 text-[#F5E6D3]/40 cursor-not-allowed"
              }`}
            >
              {isBuying ? <span className="animate-spin text-xl">⏳</span> : <Sparkles size={18} />}
              {isBuying ? "Обработка..." : "Перейти к оплате"}
            </button>
          </div>
        </div>
      )}

      {/* 7. МОДАЛКА ПУБЛИЧНОЙ ОФЕРТЫ */}
      {isOfferModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-rose-950/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="absolute inset-0" onClick={() => setIsOfferModalOpen(false)}></div>
          <div className="relative bg-rose-900 w-full max-w-lg h-[80vh] flex flex-col rounded-[2rem] shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between p-5 border-b border-rose-800/50">
              <h3 className="text-lg font-bold text-[#F5E6D3]">Публичная оферта</h3>
              <button onClick={() => setIsOfferModalOpen(false)} className="p-2 text-[#F5E6D3]/60 hover:text-[#F5E6D3] bg-rose-950/50 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 text-[#F5E6D3] text-sm whitespace-pre-wrap profile-markdown">
              <ReactMarkdown>{PUBLIC_OFFER_TEXT}</ReactMarkdown>
            </div>
            <div className="p-5 border-t border-rose-800/50 bg-rose-950/30 rounded-b-[2rem]">
              <button onClick={() => {setIsOfferAccepted(true); setIsOfferModalOpen(false);}} className="w-full py-3.5 bg-green-800 hover:bg-green-700 text-white font-bold rounded-xl transition-colors">
                Принять и закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
