import { useRef, useState } from 'react';
import { User, Sparkles, Wallet, Bell, FileText, Shield, ChevronRight, Users } from 'lucide-react';
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
    <Tag onClick={onClick} className="w-full flex items-center gap-3 py-3.5 text-left text-[#F5E6D3]">
      <Icon size={20} className="shrink-0 text-[#F5E6D3]/80" />
      <span className="flex-1 min-w-0">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-xs text-[#F5E6D3]/60 mt-0.5">{hint}</span>}
      </span>
      {children ?? <ChevronRight size={20} className="shrink-0 text-[#F5E6D3]/60" />}
    </Tag>
  );
}

export default function ProfileTab({ request }) {
  const { profile, isPremium, refreshProfile, isGeneratingPortrait } = useProfile();
  const { navigate, openBilling } = useAppNav();
  const handleError = useErrorHandler();
  const [page, setPage] = useState(null);
  const [isSavingReminder, setIsSavingReminder] = useState(false);
  const reminderRequest = useRef(false);
  const [pageOrigin, setPageOrigin] = useState(null);
  const [handledRequest, setHandledRequest] = useState(null);

  // Переход из другой вкладки или ссылка из бота: ?tab=profile&page=portrait
  if (request && request.id !== handledRequest) {
    setHandledRequest(request.id);
    setPage(PAGES.includes(request.page) ? request.page : null);
    setPageOrigin(request.returnTo || null);
  }

  const tgUser = WebApp.initDataUnsafe?.user || { first_name: 'Пользователь', username: '' };
  const state = portraitState(profile);

  const openPortrait = () => { setPageOrigin(null); setPage('portrait'); };

  const toggleReminders = async () => {
    if (reminderRequest.current) return;
    reminderRequest.current = true;
    setIsSavingReminder(true);
    try {
      await api('/api/settings', { method: 'PATCH', body: { diary_reminders: !profile.diary_reminders } });
      await refreshProfile();
    } catch (err) {
      handleError(err, 'Не удалось сохранить настройку');
    } finally { reminderRequest.current = false; setIsSavingReminder(false); }
  };

  const closePage = () => {
    setPage(null);
    setPageOrigin(null);
    if (pageOrigin) navigate({ tab: pageOrigin });
  };

  return (
    <div className="app-screen ui-stack">
      {/* ШАПКА: АВАТАР, ИМЯ И СТАТУС */}
      <div className="profile-header ui-card min-w-0">
        <img className="profile-header__vine profile-header__vine--top" src={headerVine} alt="" aria-hidden="true" width="512" height="512" draggable="false" />
        <div className="profile-header__content flex items-start gap-4 w-full min-w-0">
          <Avatar
            src={tgUser.photo_url && tgUser.id ? `${API_URL}/api/avatar/${tgUser.id}` : null}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover shadow-lg shrink-0"
            fallback={
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-950/40 text-[#F5E6D3] rounded-full flex items-center justify-center font-bold text-2xl shadow-inner shrink-0">
                {tgUser.first_name?.[0] || <User size={32} />}
              </div>
            }
          />
          <div className="flex-1 min-w-0">
            <div className="min-w-0">
              <h2 className="text-lg sm:text-2xl font-bold text-[#F5E6D3] truncate">{tgUser.first_name}</h2>
              {tgUser.username && <p className="text-xs sm:text-base text-[#F5E6D3] font-medium truncate">@{tgUser.username}</p>}
            </div>
            <button type="button" onClick={openBilling} className="flex items-center gap-1 min-h-11 mt-2 active:scale-95" aria-label="Подписка и баланс">
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

      <div className="flex flex-col gap-6">
        <div>
          <ClayBanner
            id="profile-portrait"
            kind="profile"
            title="Мой портрет личности"
            description={isGeneratingPortrait ? 'Портрет формируется…' : state ? PORTRAIT_CAPTIONS[state](profile) : ''}
            image={portraitBanner}
            onClick={openPortrait}
          />

        </div>

        <div className="ui-card py-1! divide-y divide-[#F5E6D3]/10">
          <MenuRow icon={Users} label="Друзья и совместимость" onClick={() => navigate({ tab: 'reports', section: 'compatibility' })} />
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
              disabled={!profile || isSavingReminder}
              className="relative w-12 min-h-11 shrink-0 disabled:opacity-50"
            >
              <span aria-hidden="true" className={`absolute inset-x-0 top-2 h-7 rounded-full transition-colors ${profile?.diary_reminders ? 'bg-emerald-700' : 'bg-rose-950'}`}>
                <span className={`absolute top-1 w-5 h-5 rounded-full bg-[#F5E6D3] transition-[left] ${profile?.diary_reminders ? 'left-6' : 'left-1'}`} />
              </span>
            </button>
          </MenuRow>
          <MenuRow icon={FileText} label="Публичная оферта" onClick={() => { setPageOrigin(null); setPage('offer'); }} />
          {profile?.is_admin && <MenuRow icon={Shield} label="Админ-панель" onClick={() => { setPageOrigin(null); setPage('admin'); }} />}
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
