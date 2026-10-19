import { useState, useEffect, useCallback, useMemo } from 'react';
import { ProfileContext } from './profile';
import { api } from '../utils/api';

// Один источник правды о статусе пользователя. Обновляется, когда что-то его меняет
// (тест, портрет — вызывают refreshProfile) и когда пользователь возвращается в приложение,
// например после оплаты в ЮKassa
export default function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(null);

  const refreshProfile = useCallback(() => {
    api('/api/profile').then(setProfile).catch(console.error);
  }, []);

  useEffect(() => {
    refreshProfile();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshProfile();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshProfile]);

  const value = useMemo(() => ({ profile, refreshProfile }), [profile, refreshProfile]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}
