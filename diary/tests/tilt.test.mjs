import test from 'node:test';
import assert from 'node:assert/strict';
import { createTiltTracker, isNoticeable, toScreenAxes } from '../src/utils/tilt.js';

test('Первый замер — нейтраль, наклон дает сдвиг в пределах -1…1', () => {
  const track = createTiltTracker({ range: 0.4, settle: 0 });
  assert.deepEqual(track(0.8, 0.1), { x: 0, y: 0 });
  const tilt = track(0.9, 0.3);
  assert.ok(Math.abs(tilt.x - 0.5) < 1e-9 && Math.abs(tilt.y - 0.25) < 1e-9, JSON.stringify(tilt));
  assert.deepEqual(track(3, -2), { x: -1, y: 1 });
});

test('При неподвижном наклоне сдвиг плавно возвращается к центру', () => {
  const track = createTiltTracker();
  track(0.8, 0);
  const first = track(0.8, 0.2).x;
  let last = first;
  for (let i = 0; i < 300; i += 1) last = track(0.8, 0.2).x;
  assert.ok(first > 0.5 && last < 0.01, `${first} → ${last}`);
});

test('Переход угла через ±180° не дает скачка', () => {
  const track = createTiltTracker({ settle: 0 });
  track(Math.PI - 0.05, 0);
  assert.ok(Math.abs(track(-Math.PI + 0.05, 0).y) < 0.3);
});

test('Пустые значения датчика пропускаются; оси поворачиваются вместе с экраном', () => {
  assert.equal(createTiltTracker()(null, 0), null);
  assert.deepEqual(toScreenAxes({ x: 1, y: 0 }, 0), { x: 1, y: 0 });
  assert.deepEqual(toScreenAxes({ x: 1, y: 0 }, 90), { x: 0, y: -1 });
  assert.deepEqual(toScreenAxes({ x: 0, y: 1 }, -90), { x: -1, y: 0 });
});

test('Дрожь руки не дает новых кадров, заметный наклон — дает', () => {
  const center = { x: 0, y: 0 };
  assert.equal(isNoticeable(center, { x: 0.01, y: -0.015 }), false);
  assert.equal(isNoticeable(center, { x: 0, y: 0.03 }), true);
  // Медленный возврат к центру копится и все равно доходит до картинок
  const track = createTiltTracker();
  track(0.8, 0);
  let shown = track(0.8, 0.2);
  for (let i = 0; i < 300; i += 1) {
    const next = track(0.8, 0.2);
    if (isNoticeable(shown, next)) shown = next;
  }
  assert.ok(shown.x < 0.03, String(shown.x));
});
