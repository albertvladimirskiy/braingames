import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeStates } from '../js/core/merge.js';
import { defaultState } from '../js/core/storage.js';

const st = (patch = {}) => Object.assign(defaultState(), patch);
const strip = ({ rev, ...rest }) => rest;

test('merging a state with itself changes nothing (idempotent)', () => {
  const a = st({
    xp: 90, ratings: { attention: { r: 1100, n: 12 } }, bests: { stroop: { score: 300, at: 5 } },
    history: [{ gameId: 'stroop', mode: 'free', score: 300, at: 5, xp: 35 }], counters: { runs: 4 },
    srs: { italian: { 'it-a': { box: 3, due: 10, lapses: 0, seen: 4 } } }, achievements: { first_rep: 100 },
  });
  assert.deepEqual(strip(mergeStates(a, a)), strip(a));
});

test('ratings: more rated items wins; xp, bests and run counter take the max', () => {
  const l = st({ xp: 100, ratings: { attention: { r: 1050, n: 10 }, estimation: { r: 1200, n: 40 } }, bests: { stroop: { score: 200, at: 1 } }, counters: { runs: 5 } });
  const r = st({ xp: 80, ratings: { attention: { r: 1130, n: 25 }, estimation: { r: 900, n: 3 } }, bests: { stroop: { score: 350, at: 2 }, sure: { score: 90, at: 3 } }, counters: { runs: 9 } });
  const m = mergeStates(l, r);
  assert.equal(m.xp, 100);
  assert.deepEqual(m.ratings.attention, { r: 1130, n: 25 });
  assert.deepEqual(m.ratings.estimation, { r: 1200, n: 40 });
  assert.deepEqual(m.bests, { stroop: { score: 350, at: 2 }, sure: { score: 90, at: 3 } });
  assert.equal(m.counters.runs, 9);
});

test('history is a de-duplicated union ordered by time and capped', () => {
  const run = (at, score = 10) => ({ gameId: 'stroop', mode: 'free', score, at, xp: 5 });
  const m = mergeStates(st({ history: [run(1), run(3), run(5)] }), st({ history: [run(3), run(2), run(4, 99)] }));
  assert.deepEqual(m.history.map((h) => h.at), [1, 2, 3, 4, 5]);
  const many = mergeStates(st({ history: Array.from({ length: 200 }, (_, i) => run(i)) }), st({ history: Array.from({ length: 200 }, (_, i) => run(1000 + i)) }));
  assert.equal(many.history.length, 300);
  assert.equal(many.history.at(-1).at, 1199);
});

test('SRS keeps the more-reviewed card per item and unions decks', () => {
  const card = (box, seen, due = 10) => ({ box, due, lapses: 0, seen });
  const m = mergeStates(
    st({ srs: { italian: { a: card(2, 3), b: card(4, 9) } } }),
    st({ srs: { italian: { a: card(5, 8), c: card(1, 1) }, russian: { z: card(2, 2) } } }),
  );
  assert.equal(m.srs.italian.a.box, 5);
  assert.equal(m.srs.italian.b.box, 4);
  assert.ok(m.srs.italian.c);
  assert.ok(m.srs.russian.z);
});

test('daily: results are unioned (same date keeps ours); streak follows the later lastDate', () => {
  const res = (total) => ({ scores: { quickmath: total }, total });
  const l = st({ daily: { ...defaultState().daily, results: { '2026-10-04': res(100), '2026-10-05': res(500) }, streak: 2, best: 2, lastDate: '2026-10-05', completed: 2 } });
  const r = st({ daily: { ...defaultState().daily, results: { '2026-10-05': res(900), '2026-10-06': res(300) }, streak: 3, best: 3, lastDate: '2026-10-06', freezes: 1, completed: 5 } });
  const m = mergeStates(l, r);
  assert.deepEqual(Object.keys(m.daily.results), ['2026-10-04', '2026-10-05', '2026-10-06']);
  assert.equal(m.daily.results['2026-10-05'].total, 500);
  assert.deepEqual([m.daily.streak, m.daily.lastDate, m.daily.freezes], [3, '2026-10-06', 1]);
  assert.equal(m.daily.best, 3);
  assert.equal(m.daily.completed, 5);
  // commutative on the streak decision
  assert.equal(mergeStates(r, l).daily.streak, 3);
});

test('achievements keep the earlier unlock; seen ids union; settings and device credentials stay local', () => {
  const l = st({ achievements: { first_rep: 500 }, seen: { sure: ['a', 'b'] }, flags: { welcomed: false } });
  l.settings.theme = 'light';
  l.settings.sync = { url: 'http://x', deviceId: 'd', token: 't', name: '' };
  const r = st({ achievements: { first_rep: 300, streak_3: 700 }, seen: { sure: ['b', 'c'], ballpark: ['z'] }, flags: { welcomed: true } });
  r.settings.theme = 'dark';
  const m = mergeStates(l, r);
  assert.deepEqual(m.achievements, { first_rep: 300, streak_3: 700 });
  assert.deepEqual(m.seen, { sure: ['a', 'b', 'c'], ballpark: ['z'] });
  assert.equal(m.flags.welcomed, true);
  assert.equal(m.settings.theme, 'light');
  assert.equal(m.settings.sync.token, 't');
});

test('calibration buckets keep the larger sample per bucket; hostile remote input cannot crash the merge', () => {
  const l = st();
  l.calibration.buckets[4] = { n: 10, hits: 7, sumQ: 9 };
  const r = st();
  r.calibration.buckets[4] = { n: 20, hits: 15, sumQ: 18 };
  r.calibration.buckets[0] = { n: 3, hits: 2, sumQ: 1.6 };
  const m = mergeStates(l, r);
  assert.equal(m.calibration.buckets[4].n, 20);
  assert.equal(m.calibration.buckets[0].n, 3);
  assert.doesNotThrow(() => mergeStates(l, { history: 'x', ratings: 7, srs: null }));
  assert.doesNotThrow(() => mergeStates(l, {}));
});
