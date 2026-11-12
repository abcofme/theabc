import { useRef, useState } from 'react';
import { User, Sparkles, Wallet, Bell, FileText, Shield, ChevronRight, Users, Leaf, Download, ArrowRight } from '../../components/ClayIcon';
import Avatar from '../../components/Avatar';
import ClayBanner from '../../components/ClayBanner';
import Switch from '../../components/Switch';
import Page from '../../components/Page';
import { lazyScreen } from '../../components/lazyScreen';
import InstallPage from '../install/InstallPage';
import BonusesSection from '../bonuses/BonusesSection';
import ProfileStats from './ProfileStats';
import { ContactInformation } from '../legal/ServiceInformation';
import headerVine from '../../assets/profile/header-vine-thick.webp';
import portraitBanner from '../../assets/profile/portrait-woman-handmade.webp';
import logo from '../../assets/logo.webp';
import { useProfile, portraitState } from '../../context/profile';
import { useAppNav, useErrorHandler } from '../../navigation/appNav';
import { api } from '../../utils/api';
import { formatTokens } from '../diary/utils';
import { clearSession, currentUser, isStandalone, isTelegram } from '../../utils/platform';
import { useTheme } from '../../context/theme';
import './profile-header.css';

const API_URL = window.location.origin;
const WebApp = window.Telegram.WebApp;
const ReferralPage = lazyScreen(() => import('../referrals/ReferralCabinet'));
const AdminPanel = lazyScreen(() => import('../admin/AdminPanel'));
const OfferPage = lazyScreen(() => import('../legal/OfferPage'));
const PortraitPage = lazyScreen(() => import('./PortraitPage'));
// Тот же дневник в браузере: адрес сайта, с которого открыт мини-апп
const SITE_URL = window.location.origin;
const SITE_HOST = window.location.host;

const PAGES = ['portrait', 'offer', 'contacts', 'admin', 'install', 'referral'];

const PORTRAIT_CAPTIONS = {
  tests: (p) => `Пройдено ${p.passed_tests} из ${p.total_tests} тестов`,
  ready: () => 'Все тесты пройдены — можно сформировать портрет',
  outdated: () => 'Есть новые результаты — портрет можно обновить',
  done: () => 'Подробный анализ черт характера',
};

function MenuRow({ icon: Icon, label, hint, onClick, children }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className="w-full flex items-center gap-3 py-3.5 text-left text-[var(--ui-text)]">
      <Icon size={20} className="shrink-0 text-[var(--ui-secondary)]" />
      <span className="flex-1 min-w-0">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-xs text-[var(--ui-muted)] mt-0.5">{hint}</span>}
      </span>
      {children ?? <ChevronRight size={20} className="shrink-0 text-[var(--ui-muted)]" />}
    </Tag>
  );
}

export default function ProfileTab({ request, active }) {
  const { theme, toggleTheme } = useTheme();
  const { profile, isPremium, refreshProfile, isGeneratingPortrait } = useProfile();
  const { navigate, openBilling } = useAppNav();
  const handleError = useErrorHandler();
  const [page, setPage] = useState(null);
  const [showAllBonuses, setShowAllBonuses] = useState(false);
  const [isSavingReminder, setIsSavingReminder] = useState(false);
  const reminderRequest = useRef(false);
  const [pageOrigin, setPageOrigin] = useState(null);
  const [handledRequest, setHandledRequest] = useState(null);

  // Переход из другой вкладки или ссылка из бота: ?tab=profile&page=portrait
  if (request && request.id !== handledRequest) {
    setHandledRequest(request.id);
    setPage(PAGES.includes(request.page) ? request.page : null);
    setPageOrigin(request.returnTo || null);
    if (request.page === 'bonuses') setShowAllBonuses(true);
  }

  const tgUser = currentUser() || { first_name: 'Пользователь', username: '' };
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

  // Выход только из этого браузера: сессия на сервере удаляется, приложение возвращается к экрану входа
  const logout = () => WebApp.showConfirm('Выйти из аккаунта на этом устройстве?', async (confirmed) => {
    if (!confirmed) return;
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* сессия и так забудется на устройстве */ }
    clearSession();
  });

  const closePage = () => {
    setPage(null);
    setPageOrigin(null);
    if (pageOrigin) navigate({ tab: pageOrigin });
  };

  const goFromBonuses = (target) => {
    setPageOrigin(null);
    if (target.tab === 'profile') {
      setPage(target.page);
    } else {
      setPage(null);
      navigate(target);
    }
  };

  return (
    <div className="app-screen ui-stack">
      <h1 className="sr-only">Профиль</h1>

      {/* ШАПКА: АВАТАР, ИМЯ И СТАТУС */}
      <div className="profile-header min-w-0">
        <img className="profile-header__vine profile-header__vine--top" src={headerVine} alt="" aria-hidden="true" width="512" height="512" draggable="false" />
        <img className="profile-header__vine profile-header__vine--bottom" src={headerVine} alt="" aria-hidden="true" width="512" height="512" draggable="false" />
        <div className="profile-header__content flex flex-col items-center text-center w-full min-w-0">
          <Avatar
            src={tgUser.avatar_kind === 'logo' ? logo : tgUser.photo_url && tgUser.id ? `${API_URL}/api/avatar/${tgUser.id}` : null}
            className="profile-header__avatar w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover shadow-lg shrink-0"
            fallback={
              <div className="profile-header__avatar w-20 h-20 sm:w-24 sm:h-24 ui-avatar text-[var(--ui-text)] rounded-full flex items-center justify-center font-bold text-3xl shadow-inner shrink-0">
                {tgUser.first_name?.[0] || <User size={36} />}
              </div>
            }
          />
          <div className="w-full min-w-0 mt-3">
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--ui-text)] truncate">{tgUser.first_name}</h2>
            {tgUser.username && <p className="text-sm sm:text-base text-[var(--ui-secondary)] font-medium truncate">@{tgUser.username}</p>}
          </div>
          <button type="button" onClick={openBilling} className="flex items-center gap-1 min-h-11 mt-2 active:scale-95" aria-label={isPremium ? 'Подписка' : 'Подписка и баланс'}>
            <span className={`font-bold px-3 py-1.5 rounded-xl text-sm sm:text-base flex items-center gap-1.5 clay-raised-sm ${
              isPremium ? 'profile-header__premium' : 'bg-rose-900 border border-[var(--ui-border)] text-[var(--ui-text)]'
            }`}>
              {!profile ? '…' : isPremium ? <><Sparkles size={16} /> Premium</> : <><Wallet size={16} /> {formatTokens(profile.balance)}</>}
            </span>
            <ChevronRight size={20} className="text-[var(--ui-muted)] shrink-0" />
          </button>
        </div>
      </div>

      <BonusesSection
        bonuses={profile?.bonuses}
        categories={profile?.categories}
        expanded={showAllBonuses}
        onToggle={() => setShowAllBonuses(value => !value)}
        onGo={goFromBonuses}
      />

      <ProfileStats active={active} />

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

        <div className="ui-card py-1! divide-y divide-[var(--ui-text)]/10">
          <MenuRow icon={Users} label="Друзья и совместимость" onClick={() => navigate({ tab: 'reports', section: 'compatibility' })} />
          <MenuRow
            icon={isPremium ? Sparkles : Wallet}
            label={isPremium ? 'Подписка' : 'Подписка и баланс'}
            hint={isPremium ? 'Premium активен' : 'Баланс расходуется по мере использования'}
            onClick={openBilling}
          />
          <MenuRow icon={Leaf} label="Светлая тема">
            <Switch checked={theme === 'light'} label="Светлая тема" onClick={toggleTheme} />
          </MenuRow>
          {tgUser.auth_provider !== 'password' && <MenuRow icon={Bell} label="Напоминания о дневнике" hint="Вечером, если за день не было записей">
            <Switch checked={!!profile?.diary_reminders} label="Напоминания о дневнике" onClick={toggleReminders} disabled={!profile || isSavingReminder} />
          </MenuRow>}
          {!isStandalone && (
            <MenuRow
              icon={Download}
              label="Приложение на телефон"
              hint="Дневник на главном экране, как обычное приложение"
              onClick={() => { setPageOrigin(null); setPage('install'); }}
            />
          )}
          <MenuRow icon={FileText} label="Публичная оферта" onClick={() => { setPageOrigin(null); setPage('offer'); }} />
          <MenuRow icon={FileText} label="Контакты и реквизиты" onClick={() => { setPageOrigin(null); setPage('contacts'); }} />
          {profile?.is_partner && <MenuRow icon={Users} label="Партнёрская программа"
            hint="Приглашения, аналитика и вознаграждения"
            onClick={() => { setPageOrigin(null); setPage('referral'); }} />}
          {profile?.is_admin && <MenuRow icon={Shield} label="Админ-панель" onClick={() => { setPageOrigin(null); setPage('admin'); }} />}
          {!isTelegram && <MenuRow icon={ArrowRight} label="Выйти" onClick={logout}>{false}</MenuRow>}
        </div>

        <p className="ui-secondary text-center px-4">
          «Азбука Я» работает и в браузере — на компьютере и телефоне:{' '}
          <a
            href={SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={isTelegram ? (event) => { event.preventDefault(); WebApp.openLink(SITE_URL); } : undefined}
            className="font-semibold text-[var(--ui-text)] underline underline-offset-4"
          >{SITE_HOST}</a>. {tgUser.auth_provider === 'password' ? 'Этот профиль не связан с Telegram.' : 'Вход через Telegram.'}
        </p>
      </div>

      {page === 'portrait' && <PortraitPage onBack={closePage} />}
      {page === 'offer' && <OfferPage onBack={closePage} />}
      {page === 'contacts' && <Page title="Контакты и реквизиты" onBack={closePage}><div className="ui-card"><ContactInformation /></div></Page>}
      {page === 'install' && <InstallPage onBack={closePage} />}
      {page === 'referral' && profile?.is_partner && <ReferralPage onBack={closePage} />}
      {page === 'admin' && profile?.is_admin && (
        <Page title="Админ-панель" onBack={closePage}>
          <AdminPanel section={request?.page === 'admin' ? request.section : null} />
        </Page>
      )}
    </div>
  );
}
