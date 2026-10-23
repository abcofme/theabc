import { useState } from 'react';
import { User, Sparkles, Wallet, Bell, FileText, Shield, ChevronRight } from 'lucide-react';
import Avatar from '../../components/Avatar';
import ClayBanner from '../../components/ClayBanner';
import Page from '../../components/Page';
import AdminPanel from '../admin/AdminPanel';
import OfferPage from '../legal/OfferPage';
import PortraitPage from './PortraitPage';
import portraitBanner from '../../assets/profile/portrait-woman-handmade.webp';
import headerVine from '../../assets/profile/header-vine-handmade.webp';
import { useProfile, portraitState } from '../../context/profile';
import { useAppNav, useErrorHandler } from '../../navigation/appNav';
import { api } from '../../utils/api';
import './profile-header.css';

const API_URL = window.location.origin;
const WebApp = window.Telegram.WebApp;

const PAGES = ['portrait', 'offer', 'admin'];

const PORTRAIT_CAPTIONS = {
  tests: (p) => `Пройдено ${p.passed_tests} из ${p.total_tests} тестов`,
  ready: () => 'Все тесты пройдены — можно сформировать портрет',
  outdated: () => 'Есть новые результаты — портрет можно обновить',
  done: () => 'Подробный анализ черт характера',
};

function MenuRow({ icon: Icon, label, hint, onClick, children }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-[#F5E6D3]">
      <Icon size={20} className="shrink-0 text-[#F5E6D3]/80" />
      <span className="flex-1 min-w-0">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-xs text-[#F5E6D3]/60 mt-0.5">{hint}</span>}
      </span>
      {children ?? <ChevronRight size={18} className="shrink-0 text-[#F5E6D3]/60" />}
    </Tag>
  );
}

export default function ProfileTab({ request }) {
  const { profile, isPremium, refreshProfile, generatePortrait, isGeneratingPortrait } = useProfile();
  const { navigate, openBilling } = useAppNav();
  const handleError = useErrorHandler();
  const [page, setPage] = useState(null);
  const [handledRequest, setHandledRequest] = useState(null);

  // Переход из другой вкладки или ссылка из бота: ?tab=profile&page=portrait
  if (request && request.id !== handledRequest) {
    setHandledRequest(request.id);
    setPage(PAGES.includes(request.page) ? request.page : null);
  }

  const tgUser = WebApp.initDataUnsafe?.user || { first_name: 'Пользователь', username: '' };
  const state = portraitState(profile);

  const openPortrait = async () => {
    if (state === 'tests') {
      navigate({ tab: 'tests' });
      return;
    }
    if (state === 'ready' && !isGeneratingPortrait) {
      try {
        await generatePortrait();
      } catch (err) {
        handleError(err);
        return;
      }
    }
    setPage('portrait');
  };

  const toggleReminders = async () => {
    try {
      await api('/api/settings', { method: 'PATCH', body: { diary_reminders: !profile.diary_reminders } });
      await refreshProfile();
    } catch (err) {
      handleError(err, 'Не удалось сохранить настройку');
    }
  };

  const closePage = () => setPage(null);

  return (
    <div className="flex flex-col relative select-none bg-transparent max-w-2xl mx-auto w-full">
      {/* ШАПКА: АВАТАР, ИМЯ И СТАТУС */}
      <div className="profile-header bg-rose-900/80 rounded-3xl mx-2 mt-2 mb-4 backdrop-blur-sm min-w-0">
        <img className="profile-header__vine profile-header__vine--top" src={headerVine} alt="" aria-hidden="true" width="512" height="512" draggable="false" />
        <img className="profile-header__vine profile-header__vine--bottom" src={headerVine} alt="" aria-hidden="true" width="512" height="512" draggable="false" />
        <div className="profile-header__content flex items-center gap-3 sm:gap-4 w-full min-w-0">
          <Avatar
            src={tgUser.photo_url && tgUser.id ? `${API_URL}/api/avatar/${tgUser.id}` : null}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover shadow-lg shrink-0"
            fallback={
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-950/40 text-[#F5E6D3] rounded-full flex items-center justify-center font-bold text-2xl shadow-inner shrink-0">
                {tgUser.first_name?.[0] || <User size={32} />}
              </div>
            }
          />
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-3 justify-between">
            <div className="min-w-[100px] flex-1">
              <h2 className="text-lg sm:text-2xl font-bold text-[#F5E6D3] truncate">{tgUser.first_name}</h2>
              {tgUser.username && <p className="text-xs sm:text-base text-[#F5E6D3] font-medium truncate">@{tgUser.username}</p>}
            </div>
            <button type="button" onClick={openBilling} className="flex items-center gap-1 shrink-0 active:scale-95" aria-label="Подписка и баланс">
              <span className={`font-bold px-3 py-1.5 rounded-xl text-sm sm:text-base flex items-center gap-1.5 shadow-sm ${
                isPremium ? 'profile-header__premium' : 'bg-rose-950 text-[#F5E6D3]'
              }`}>
                {!profile ? '…' : isPremium ? <><Sparkles size={16} /> Premium</> : <><Wallet size={16} /> {profile.balance} ₽</>}
              </span>
              <ChevronRight size={20} className="text-[#F5E6D3]/60 shrink-0" />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-2 mb-4 flex flex-col gap-4">
        <div>
          <ClayBanner
            id="profile-portrait"
            kind="profile"
            title="Мой портрет личности"
            description={state ? PORTRAIT_CAPTIONS[state](profile) : ''}
            image={portraitBanner}
            onClick={openPortrait}
          />
          {state && state !== 'done' && (
            <p className="text-sm text-[#F5E6D3]/80 text-center mt-2 px-2" aria-live="polite">
              {isGeneratingPortrait ? 'Портрет формируется…' : PORTRAIT_CAPTIONS[state](profile)}
            </p>
          )}
        </div>

        <div className="bg-rose-900/60 rounded-3xl divide-y divide-[#F5E6D3]/10 overflow-hidden">
          <MenuRow
            icon={Wallet}
            label="Подписка и баланс"
            hint={isPremium ? 'Premium активен' : 'Баланс расходуется по мере использования'}
            onClick={openBilling}
          />
          <MenuRow icon={Bell} label="Напоминания о дневнике" hint="Вечером, если за день не было записей">
            <button
              type="button"
              role="switch"
              aria-checked={!!profile?.diary_reminders}
              aria-label="Напоминания о дневнике"
              onClick={toggleReminders}
              disabled={!profile}
              className={`relative w-12 h-7 rounded-full shrink-0 transition-colors ${profile?.diary_reminders ? 'bg-emerald-700' : 'bg-rose-950'}`}
            >
              <span className={`absolute top-1 w-5 h-5 rounded-full bg-[#F5E6D3] transition-all ${profile?.diary_reminders ? 'left-6' : 'left-1'}`} />
            </button>
          </MenuRow>
          <MenuRow icon={FileText} label="Публичная оферта" onClick={() => setPage('offer')} />
          {profile?.is_admin && <MenuRow icon={Shield} label="Админ-панель" onClick={() => setPage('admin')} />}
        </div>
      </div>

      {page === 'portrait' && <PortraitPage onBack={closePage} />}
      {page === 'offer' && <OfferPage onBack={closePage} />}
      {page === 'admin' && (
        <Page title="Админ-панель" onBack={closePage}>
          <AdminPanel />
        </Page>
      )}
    </div>
  );
}
