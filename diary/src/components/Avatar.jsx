import { useState } from 'react';

// Фото отдаёт наш /api/avatar (t.me в РФ недоступен). Нет фото или не загрузилось — показываем заглушку
export default function Avatar({ src, className, fallback }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return fallback;
  return <img src={src} alt="" className={className} onError={() => setFailed(true)} />;
}
