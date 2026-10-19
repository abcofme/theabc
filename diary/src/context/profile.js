import { createContext, useContext } from 'react';

export const ProfileContext = createContext({ profile: null, refreshProfile: () => {} });

// Статус пользователя (доступ, портрет, прогресс тестов), общий для всех вкладок
export const useProfile = () => useContext(ProfileContext);
