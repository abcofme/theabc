import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_STORAGE_KEY, readTheme, saveTheme, syncTelegramTheme } from '../src/utils/theme.js';

test('Тема сохраняется и восстанавливается; неизвестное значение оставляет бордовую тему', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(readTheme(storage), 'dark');
  saveTheme(storage, 'light');
  assert.equal(readTheme(storage), 'light');
  storage.setItem(THEME_STORAGE_KEY, 'unknown');
  assert.equal(readTheme(storage), 'dark');
  saveTheme(storage, 'dark');
  assert.equal(readTheme(storage), 'dark');
});

test('Недоступное хранилище не прерывает работу темы', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readTheme(storage), 'dark');
  assert.doesNotThrow(() => saveTheme(storage, 'light'));
});

test('Цвета Telegram обновляются и при отсутствии поддержки отдельного метода', () => {
  const calls = [];
  const app = {
    setBackgroundColor: color => calls.push(['background', color]),
    setHeaderColor() { throw new Error('unsupported'); },
    setBottomBarColor: color => calls.push(['bottom', color]),
  };
  syncTelegramTheme(app, 'light');
  syncTelegramTheme(app, 'dark');
  assert.deepEqual(calls, [['background', '#F4ECDF'], ['bottom', '#FFF8EE'], ['background', '#2B0A0A'], ['bottom', '#541515']]);
  assert.doesNotThrow(() => syncTelegramTheme(undefined, 'light'));
});
