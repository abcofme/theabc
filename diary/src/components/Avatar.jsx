import { useEffect, useState } from 'react';
import { apiBlob } from '../utils/api';

// Фото отдаёт наш /api/avatar (t.me в РФ недоступен). Нет фото или не загрузилось — показываем заглушку
export default function Avatar({ src, className, fallback }) {
  const [image, setImage] = useState(null);
  const [failed, setFailed] = useState(null);
  const protectedImage = src?.startsWith('/api/avatar/');

  useEffect(() => {
    if (!protectedImage) return;
    const controller = new AbortController();
    let objectUrl;
    apiBlob(src, { signal: controller.signal }).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setImage({ source: src, url: objectUrl });
    }).catch(() => {});
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [protectedImage, src]);

  const url = protectedImage ? (image?.source === src ? image.url : null) : src;
  if (!url || failed === url) return fallback;
  return <img src={url} alt="" className={className} onError={() => setFailed(url)} />;
}
