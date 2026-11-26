import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/utils/api.js', import.meta.url), 'utf8')
  .replace(/^import .* from '\.\/platform';\n/m, '')
  .replaceAll('import.meta.env.VITE_DIRECT_API_URL', '"https://direct.abcofme.ru"')
  .replace(/^export /gm, '');

function fixture({ origin = 'https://abcofme.ru', telegram = true, fetcher = () => new Response('{"ok":true}') } = {}) {
  const calls = [];
  const context = vm.createContext({
    window: { location: { origin } }, isTelegram: telegram,
    Blob, AbortController, setTimeout, clearTimeout,
    apiHeaders: () => ({ Authorization: 'test-session' }),
    getSession: () => null, clearSession() {}, onSessionChange() {},
    fetch: async (path, init) => {
      calls.push({ url: new URL(path, origin).href, init });
      return fetcher(path, init);
    },
  });
  vm.runInContext(`${source}\nglobalThis.client = { api, apiStream, apiBlob };`, context);
  return { client: context.client, calls };
}

test('Браузер и Telegram не пробуют другой сервер при загрузке приложения', async () => {
  for (const telegram of [false, true]) {
    const { calls } = fixture({ telegram });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 0);
  }
});

test('API, потоковые ответы и аватарки сохраняют домен страницы на обоих путях', async () => {
  for (const origin of ['https://abcofme.ru', 'https://direct.abcofme.ru', 'https://app.abcofme.ru']) {
    for (const telegram of [false, true]) {
      const { client, calls } = fixture({ origin, telegram });
      await client.api('/api/profile');
      await client.apiStream('/api/reports/generate', { type: 'energy' });
      await client.apiBlob('/api/avatar/1');
      assert.deepEqual(calls.map(call => call.url), [
        `${origin}/api/profile`, `${origin}/api/reports/generate`, `${origin}/api/avatar/1`,
      ]);
      assert.ok(calls.every(call => call.init.headers.Authorization === 'test-session'));
    }
  }
});

test('Сетевая ошибка не отправляет запрос на другой маршрут и не повторяет POST', async () => {
  const failure = new TypeError('Network error');
  const { client, calls } = fixture({ fetcher: () => { throw failure; } });
  await assert.rejects(client.api('/api/profile'), error => error === failure);
  await assert.rejects(client.api('/api/diary', { method: 'POST', body: { event: 'text' } }), error => error === failure);
  assert.deepEqual(calls.map(call => call.url), [
    'https://abcofme.ru/api/profile', 'https://abcofme.ru/api/diary',
  ]);
  assert.equal(calls[1].init.body, '{"event":"text"}');
});

test('Отмена загрузки аватарки не меняет маршрут следующих запросов', async () => {
  const { client, calls } = fixture({ fetcher: (path, init) => {
    init.signal?.throwIfAborted();
    return new Response('{"ok":true}');
  } });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.apiBlob('/api/avatar/1', { signal: controller.signal }), { name: 'AbortError' });
  await client.api('/api/profile');
  assert.deepEqual(calls.map(call => call.url), [
    'https://abcofme.ru/api/avatar/1', 'https://abcofme.ru/api/profile',
  ]);
  assert.equal(calls[0].init.signal, controller.signal);
});
