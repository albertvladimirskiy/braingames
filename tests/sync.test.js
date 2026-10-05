import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';
import { createStorage, memoryBackend } from '../js/core/storage.js';
import { createSync } from '../js/core/sync.js';
import { GAME_GRADES, benchmarkNote, calibrationInfo } from '../js/core/benchmarks.js';
import { PLACEHOLDER_NOTE } from '../js/config.js';
import { honestAnswers } from './helpers/daily-answers.js';

let server, url;
const store = createStore();
const NOW = Date.UTC(2026, 9, 5, 12);
before(async () => {
  server = http.createServer(createApp({ store, now: () => NOW }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));

/** A device: its own storage + sync client with manual timers and an in-memory benchmark cache. */
function device(overrides = {}) {
  const storage = createStorage(memoryBackend());
  const timers = [];
  const cache = (() => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; })();
  const sync = createSync({ storage, cache, setTimer: (fn) => (timers.push(fn), timers.length), clearTimer: () => {}, ...overrides });
  return { storage, sync, timers, cache };
}

test('connect registers an anonymous device and uploads local progress (without credentials)', async () => {
  const a = device();
  a.storage.update((s) => { s.xp = 50; s.bests.stroop = { score: 300, at: 1 }; });
  const r = await a.sync.connect(url, 'Ann');
  assert.ok(r.ok, r.error);
  assert.equal(a.sync.connected(), true);
  const { deviceId, token } = a.storage.get().settings.sync;
  assert.match(token, new RegExp(`^${deviceId}\\.`));
  const stored = store.data.states[deviceId].state;
  assert.equal(stored.xp, 50);
  assert.equal(stored.settings.sync, null, 'the server copy never contains the token');
  assert.equal(a.sync.status.state, 'idle');
});

test('a second device linked with the code gets the progress; both sides merge afterwards', async () => {
  const a = device();
  a.storage.update((s) => { s.xp = 70; s.ratings.attention = { r: 1100, n: 12 }; s.srs.italian = { 'it-a': { box: 3, due: 5, lapses: 0, seen: 4 } }; });
  await a.sync.connect(url, 'A');
  const b = device();
  const code = a.sync.linkCode();
  assert.match(code, /^reps-link:[A-Za-z0-9_-]+=*$/);
  await b.sync.connectWithCode(code, 'B-phone');
  assert.equal(b.storage.get().xp, 70);
  assert.deepEqual(b.storage.get().ratings.attention, { r: 1100, n: 12 });
  assert.equal(b.storage.get().settings.sync.deviceId, a.storage.get().settings.sync.deviceId);

  b.storage.update((s) => { s.xp = 90; s.bests.sure = { score: 80, at: 2 }; });
  a.storage.update((s) => { s.achievements.first_rep = 5; s.srs.italian['it-b'] = { box: 2, due: 6, lapses: 0, seen: 2 }; });
  assert.ok((await b.sync.syncNow()).ok);
  assert.ok((await a.sync.syncNow()).ok);
  const s = a.storage.get();
  assert.equal(s.xp, 90);
  assert.deepEqual(s.bests.sure, { score: 80, at: 2 });
  assert.ok(s.srs.italian['it-a'] && s.srs.italian['it-b']);
  assert.ok((await b.sync.syncNow()).ok);
  assert.equal(b.storage.get().achievements.first_rep, 5, 'and the other way round');
});

test('simultaneous syncs reconcile via 409 + retry; nothing is lost', async () => {
  const a = device();
  await a.sync.connect(url, 'A');
  const b = device();
  await b.sync.connectWithCode(a.sync.linkCode());
  a.storage.update((s) => (s.bests.stroop = { score: 111, at: 1 }));
  b.storage.update((s) => (s.bests.sure = { score: 222, at: 2 }));
  const [ra, rb] = await Promise.all([a.sync.syncNow(), b.sync.syncNow()]);
  assert.ok(ra.ok && rb.ok, `${ra.error} ${rb.error}`);
  await a.sync.syncNow();
  await b.sync.syncNow();
  for (const d of [a, b]) assert.deepEqual([d.storage.get().bests.stroop.score, d.storage.get().bests.sure.score], [111, 222]);
});

test('failures leave local data untouched and report an error status', async () => {
  const a = device({ fetchImpl: async () => { throw new Error('offline'); } });
  a.storage.update((s) => { s.xp = 5; s.settings.sync = { url, deviceId: 'x', token: 'y', name: '' }; });
  const r = await a.sync.syncNow();
  assert.equal(r.ok, false);
  assert.equal(a.sync.status.state, 'error');
  assert.equal(a.storage.get().xp, 5);
  await assert.rejects(a.sync.connect('ftp://nope'), /http/);
  assert.equal((await device().sync.syncNow()).ok, false, 'not connected');
  const bad = device();
  await assert.rejects(bad.sync.connectWithCode('garbage'), /not valid/);
  await assert.rejects(bad.sync.connectWithCode('reps-link:' + Buffer.from('{"u":"x"}').toString('base64url')), /not valid/);
  const wrongToken = device();
  const real = device();
  await real.sync.connect(url);
  const code = real.sync.linkCode().replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')); // corrupt the payload
  await assert.rejects(wrongToken.sync.connectWithCode(code));
  assert.equal(wrongToken.sync.connected(), false, 'a failed link rolls back');
});

test('debounced background sync fires only when the state changed since the last sync', async () => {
  const a = device();
  await a.sync.connect(url);
  const before = a.timers.length;
  a.storage.update((s) => (s.xp = 123));
  assert.equal(a.timers.length, before + 1, 'a change schedules a sync');
  await a.timers.at(-1)();
  await new Promise((r) => setTimeout(r, 50));
  const id = a.storage.get().settings.sync.deviceId;
  assert.equal(store.data.states[id].state.xp, 123);
  const n = a.timers.length;
  a.timers.at(-1)(); // nothing changed: no network call, no new timer
  assert.equal(a.timers.length, n);
});

test('disconnect stops syncing and forgets credentials but keeps local data', async () => {
  const a = device();
  a.storage.update((s) => (s.xp = 9));
  await a.sync.connect(url);
  a.sync.disconnect();
  assert.equal(a.sync.connected(), false);
  assert.equal(a.storage.get().settings.sync, null);
  assert.equal(a.storage.get().xp, 9);
  const n = a.timers.length;
  a.storage.update((s) => (s.xp = 10));
  assert.equal(a.timers.length, n, 'no timers once disconnected');
});

test('Daily submission is verified by the server and the leaderboard is readable', async () => {
  const a = device();
  await a.sync.connect(url, 'Ann');
  const date = '2026-10-05';
  const r = await a.sync.submitDaily(date, honestAnswers(date));
  assert.ok(r.ok, r.error);
  assert.equal(r.rank, 1);
  const again = await a.sync.submitDaily(date, honestAnswers(date));
  assert.equal(again.ok, false);
  assert.equal(again.status, 409);
  const forged = device();
  await forged.sync.connect(url, 'Mallory');
  const bad = await forged.sync.submitDaily(date, { quickmath: [{ v: 1, t: 50 }], ballpark: [], sure: [] });
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 422);
  const lb = await a.sync.leaderboard(date, 5);
  assert.ok(lb.ok);
  assert.equal(lb.me.rank, 1);
  assert.equal(lb.entries[0].name, 'Ann');
  assert.equal((await device().sync.submitDaily(date, {})).ok, false);
});

test('calibrated benchmarks from the server are applied, cached, and labelled honestly', async () => {
  const a = device();
  await a.sync.connect(url);
  assert.equal(await a.sync.refreshBenchmarks(), false, 'not enough data yet → placeholders stay');
  assert.equal(benchmarkNote(), PLACEHOLDER_NOTE);

  const mk = (i) => ({ ...a.storage.get(), history: Array.from({ length: 8 }, (_, k) => ({ gameId: 'stroop', mode: 'free', score: 100 + i * 40 + k * 7, at: k })) });
  for (let i = 0; i < 6; i++) {
    const d = device();
    await d.sync.connect(url);
    d.storage.update((s) => Object.assign(s, { history: mk(i).history }));
    await d.sync.syncNow();
  }
  const before = [...GAME_GRADES.stroop];
  assert.equal(await a.sync.refreshBenchmarks(), true);
  assert.notDeepEqual(GAME_GRADES.stroop, before);
  assert.ok(GAME_GRADES.stroop[0] < GAME_GRADES.stroop[1] && GAME_GRADES.stroop[1] < GAME_GRADES.stroop[2]);
  assert.match(benchmarkNote(), /calibrated from \d+ players/);
  assert.ok(calibrationInfo().games.includes('stroop'));
  assert.ok(a.cache.getItem('reps:benchmarks'));
  assert.equal(GAME_GRADES.quickmath.join(), '200,400,700', 'games without data keep their placeholders');
});
