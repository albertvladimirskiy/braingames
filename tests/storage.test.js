import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, memoryBackend, migrate, defaultState } from '../js/core/storage.js';
import { SCHEMA_VERSION, STORAGE_KEY } from '../js/config.js';

test('fresh storage returns defaults', () => {
  const s = createStorage(memoryBackend());
  assert.equal(s.get().v, SCHEMA_VERSION);
  assert.deepEqual(s.get().ratings, {});
  assert.equal(s.get().settings.sound, true);
});

test('update persists and a new instance sees it', () => {
  const be = memoryBackend();
  createStorage(be).update((st) => {
    st.xp = 123;
    st.ratings.estimation = { r: 1042, n: 3 };
  });
  const again = createStorage(be);
  assert.equal(again.get().xp, 123);
  assert.deepEqual(again.get().ratings.estimation, { r: 1042, n: 3 });
});

test('migrates v0 (bare-number ratings, `best`) to current', () => {
  const s = migrate({ ratings: { mental_arithmetic: 1100 }, best: { quickmath: 321 } });
  assert.equal(s.v, SCHEMA_VERSION);
  assert.deepEqual(s.ratings.mental_arithmetic, { r: 1100, n: 0 });
  assert.deepEqual(s.bests.quickmath, { score: 321, at: 0 });
  assert.equal(s.best, undefined);
  assert.ok(Array.isArray(s.history)); // defaults filled in
});

test('migrate fills missing nested defaults without clobbering', () => {
  const s = migrate({ v: SCHEMA_VERSION, settings: { sound: false } });
  assert.equal(s.settings.sound, false);
  assert.equal(s.settings.haptics, true);
  assert.equal(s.daily.streak, 0);
});

test('newer-version saves are rejected, corrupt JSON falls back to defaults', () => {
  assert.throws(() => migrate({ v: SCHEMA_VERSION + 1 }));
  const be = memoryBackend();
  be.setItem(STORAGE_KEY, '{not json');
  assert.deepEqual(createStorage(be).get(), defaultState());
});

test('export → import round-trips state', () => {
  const a = createStorage(memoryBackend());
  a.update((st) => {
    st.xp = 77;
    st.srs.italian = { 'it-1': { box: 3, due: 20000, lapses: 1, seen: 4 } };
    st.daily.results['2026-10-05'] = { total: 900 };
  });
  const json = a.exportJson();
  const b = createStorage(memoryBackend());
  b.importJson(json);
  assert.deepEqual(b.get(), a.get());
});

test('import rejects garbage and leaves state alone', () => {
  const s = createStorage(memoryBackend());
  s.update((st) => (st.xp = 5));
  assert.throws(() => s.importJson('nope'));
  assert.throws(() => s.importJson('[1,2]'));
  assert.equal(s.get().xp, 5);
});

test('reset restores defaults and clears backend', () => {
  const be = memoryBackend();
  const s = createStorage(be);
  s.update((st) => (st.xp = 9));
  s.reset();
  assert.equal(s.get().xp, 0);
  assert.equal(createStorage(be).get().xp, 0);
});

test('failing backend does not throw on update', () => {
  const be = { getItem: () => null, setItem() { throw new Error('quota'); }, removeItem() {} };
  const s = createStorage(be);
  assert.doesNotThrow(() => s.update((st) => (st.xp = 1)));
  assert.equal(s.get().xp, 1);
});

test('subscribers are notified', () => {
  const s = createStorage(memoryBackend());
  let n = 0;
  const off = s.subscribe(() => n++);
  s.update(() => {});
  off();
  s.update(() => {});
  assert.equal(n, 1);
});
