// Сервис-воркер установленного приложения. Страница всегда берется из сети, чтобы после деплоя открывалась новая
// версия, а копия нужна, только когда сети нет. Файлы сборки кэширует сам браузер (Cache-Control в deploy/Caddyfile),
// API сюда не попадает
const CACHE = 'azbuka-shell-v1';
const SHELL = '/index.html';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then(cache => cache.put(SHELL, copy)));
        }
        return response;
      })
      .catch(() => caches.match(SHELL).then(cached => cached || Response.error())),
  );
});
