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
    st.daily.results['2026-10-05'] = { scores: { quickmath: 300 }, total: 900 };
  });
  const json = a.exportJson();
  const b = createStorage(memoryBackend());
  b.importJson(json);
  const { rev: _a, ...ra } = a.get();
  const { rev: _b, ...rb } = b.get();
  assert.deepEqual(rb, ra); // everything except the save counter
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

test('multi-tab: a second storage adopts the newer revision before writing (no lost update)', () => {
  const be = memoryBackend();
  const tabA = createStorage(be);
  const tabB = createStorage(be);
  tabA.update((st) => (st.xp = 5));
  tabB.update((st) => (st.xp += 3)); // B was opened before A's write
  assert.equal(tabB.get().xp, 8);
  assert.equal(createStorage(be).get().xp, 8);
  tabA.update((st) => (st.counters.runs += 1));
  assert.equal(tabA.get().xp, 8, 'A picked up B’s write too');
});

test('sanitize: hostile or corrupted fields never crash and fall back to safe values', () => {
  const nasty = {
    v: SCHEMA_VERSION, xp: 'lots', rev: -4, settings: { sound: 'yes', theme: 'neon', motion: 3 },
    ratings: { attention: { r: 'x', n: 1 }, estimation: { r: 1200, n: 4 }, calibration: 7 },
    history: 'nope', bests: { stroop: { score: Infinity }, sure: { score: 5, at: 1 } }, counters: [],
    srs: { italian: { a: { box: 9, due: 1, lapses: 0, seen: 0 }, b: { box: 2, due: 5, lapses: 1, seen: 2 } }, bad: 'x' },
    calibration: { buckets: [1, 2] }, seen: { sure: 'x', ballpark: ['a', 3, 'b'] },
    daily: { results: { '2026-01-01': { scores: {}, total: 9 }, junk: 5 }, streak: -2, lastDate: 'yesterday', freezes: 9, progress: 'p' },
    achievements: { first_rep: 'x', ok: 123 }, prefs: [], flags: { welcomed: 'true' },
  };
  const s = migrate(nasty);
  assert.equal(s.xp, 0);
  assert.equal(s.rev, 0);
  assert.deepEqual(s.settings, { sound: true, haptics: true, theme: 'system', motion: 'system' });
  assert.deepEqual(Object.keys(s.ratings), ['estimation']);
  assert.deepEqual(s.history, []);
  assert.deepEqual(Object.keys(s.bests), ['sure']);
  assert.deepEqual(s.counters, { runs: 0 });
  assert.deepEqual(Object.keys(s.srs.italian), ['b']);
  assert.equal(s.srs.bad, undefined);
  assert.equal(s.calibration.buckets.length, 5);
  assert.deepEqual(s.seen, { ballpark: ['a', 'b'] });
  assert.deepEqual(Object.keys(s.daily.results), ['2026-01-01']);
  assert.equal(s.daily.streak, 0);
  assert.equal(s.daily.lastDate, null);
  assert.equal(s.daily.freezes, 2);
  assert.equal(s.daily.progress, null);
  assert.deepEqual(s.achievements, { ok: 123 });
  assert.deepEqual(s.flags, { welcomed: false });
  assert.deepEqual(migrate(s), s, 'sanitizing is idempotent');
});

test('a corrupted-but-parseable saved state loads instead of crashing the app', () => {
  const be = memoryBackend();
  be.setItem(STORAGE_KEY, JSON.stringify({ v: SCHEMA_VERSION, history: 'boom', ratings: 5 }));
  const s = createStorage(be);
  assert.ok(Array.isArray(s.get().history));
  assert.doesNotThrow(() => s.update((st) => st.history.push({ gameId: 'x', score: 1, at: 1 })));
});
