import test from 'node:test';
import assert from 'node:assert/strict';
import { createImagePreloader } from '../src/utils/imagePreloader.js';

function fixture() {
  const images = [];
  const loader = createImagePreloader({ createImage() {
    const image = { decode: async () => {} };
    images.push(image);
    return image;
  } });
  return { images, loader };
}

test('Очередь заранее загружает все картинки двумя запросами, начиная с текущей', async () => {
  const { images, loader } = fixture();
  loader.preload(['current', 'next', 'third', 'fourth']);
  assert.deepEqual(images.map(image => image.src), ['current', 'next']);
  assert.equal(images[0].fetchPriority, 'high');
  assert.equal(images[1].fetchPriority, 'low');
  await images[0].onload();
  assert.deepEqual(images.map(image => image.src), ['current', 'next', 'third']);
  await images[1].onload();
  assert.deepEqual(images.map(image => image.src), ['current', 'next', 'third', 'fourth']);
});

test('Отображение использует тот же запрос и ждёт декодирования; приоритет повышается', async () => {
  const { images, loader } = fixture();
  const ready = loader.load('card', 'low');
  let decoded;
  images[0].decode = () => new Promise(resolve => { decoded = resolve; });
  assert.equal(loader.load('card', 'high'), ready);
  assert.equal(images.length, 1);
  assert.equal(images[0].fetchPriority, 'high');
  let resolved = false;
  ready.then(() => { resolved = true; });
  const loading = images[0].onload();
  await Promise.resolve();
  assert.equal(resolved, false);
  decoded();
  await loading;
  assert.equal(await ready, true);
  assert.equal(loader.load('card'), ready);
});

test('Ошибка одного файла не останавливает очередь и разрешает повторную загрузку', async () => {
  const { images, loader } = fixture();
  loader.preload(['bad', 'good', 'third']);
  const failed = loader.load('bad');
  images[0].onerror();
  assert.equal(await failed, false);
  assert.equal(images[2].src, 'third');
  const retry = loader.load('bad');
  assert.equal(images[3].src, 'bad');
  images[3].decode = async () => { throw Error('unsupported'); };
  await images[3].onload();
  assert.equal(await retry, true);
});

test('Закрытие теста останавливает новые фоновые запросы, кэш пригоден при возврате', async () => {
  const { images, loader } = fixture();
  const cancel = loader.preload(['first', 'second', 'third']);
  cancel();
  await images[0].onload();
  await images[1].onload();
  assert.equal(images.length, 2);
  loader.preload(['first', 'second', 'third', 'third', undefined]);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(images.map(image => image.src), ['first', 'second', 'third']);
  assert.equal(await loader.load(undefined), false);
});

test('При смене теста освобождаются картинки прежнего набора, текущие остаются в кэше', async () => {
  const { images, loader } = fixture();
  const previous = loader.load('previous-test');
  const current = loader.load('current-test');
  await images[0].onload();
  await images[1].onload();
  loader.retain(['current-test']);
  assert.equal(loader.load('current-test'), current);
  assert.notEqual(loader.load('previous-test'), previous);
  assert.equal(images.length, 3);
});

test('Ошибка освобождённой картинки не удаляет новый запрос при быстром возврате к тесту', async () => {
  const { images, loader } = fixture();
  const abandoned = loader.load('card');
  loader.retain([]);
  const restored = loader.load('card');
  images[0].onerror();
  assert.equal(await abandoned, false);
  assert.equal(loader.load('card'), restored);
  await images[1].onload();
  assert.equal(await restored, true);
  assert.equal(images.length, 2);
});
