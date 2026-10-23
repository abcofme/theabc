import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ProfileContext } from './profile';
import { api } from '../utils/api';

const WebApp = window.Telegram.WebApp;

const PORTRAIT_POLL_INTERVAL = 3000;
// Портрет строится до пары минут; дольше — считаем, что не вышло (деньги бэкенд вернёт сам)
const PORTRAIT_POLL_TIMEOUT = 180000;

// Один источник правды о пользователе для всех вкладок: доступ, баланс, тесты, портрет.
// Обновляется, когда что-то его меняет (тест, портрет — вызывают refreshProfile)
// и когда пользователь возвращается в приложение, например после оплаты в ЮKassa
export default function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [portraitJob, setPortraitJob] = useState(null); // { since, previous } — пока строится портрет

  const refreshProfile = useCallback(() => api('/api/profile').then(setProfile).catch(console.error), []);

  useEffect(() => {
    refreshProfile();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshProfile();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshProfile]);

  // Запуск генерации портрета. Ошибку (например, 402 — не хватает баланса) получает вызывающий
  const generatePortrait = useCallback(async () => {
    await api('/api/portrait/generate', { method: 'POST' });
    setPortraitJob({ since: Date.now(), previous: profile?.portrait?.updated_at ?? null });
    refreshProfile(); // баланс уже списан
  }, [profile, refreshProfile]);

  const jobRef = useRef(portraitJob);
  useEffect(() => { jobRef.current = portraitJob; }, [portraitJob]);

  useEffect(() => {
    if (!portraitJob) return;
    const interval = setInterval(async () => {
      const job = jobRef.current;
      if (!job) return;
      try {
        const data = await api('/api/profile');
        setProfile(data);
        if (data.portrait && data.portrait.updated_at !== job.previous) {
          setPortraitJob(null);
          WebApp.HapticFeedback?.notificationOccurred('success');
        } else if (Date.now() - job.since > PORTRAIT_POLL_TIMEOUT) {
          setPortraitJob(null);
          WebApp.showAlert('Портрет не удалось сформировать. Попробуйте ещё раз чуть позже.');
          refreshProfile();
        }
      } catch (err) {
        console.error('Ошибка проверки портрета:', err);
      }
    }, PORTRAIT_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [portraitJob, refreshProfile]);

  const value = useMemo(() => ({
    profile,
    refreshProfile,
    isPremium: profile?.access_level === 'Premium',
    generatePortrait,
    isGeneratingPortrait: !!portraitJob,
  }), [profile, refreshProfile, generatePortrait, portraitJob]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}
