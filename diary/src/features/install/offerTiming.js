import { isMobile, isStandalone, isTelegram } from '../../utils/platform';

const OFFERED_KEY = 'azbuka-install-offered';

// Первый вход с телефона в браузере: сразу предлагаем установить приложение. Один раз, дальше — пункт в профиле
export function shouldOfferInstall() {
  if (isTelegram || isStandalone || !isMobile) return false;
  try { return !localStorage.getItem(OFFERED_KEY); } catch { return false; }
}

export function markInstallOffered() {
  try { localStorage.setItem(OFFERED_KEY, '1'); } catch { /* без хранилища предложим еще раз — не страшно */ }
}
