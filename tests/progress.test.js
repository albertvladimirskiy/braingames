import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeRun } from '../js/core/progress.js';
import { defaultState } from '../js/core/storage.js';
import { evaluate, ACHIEVEMENTS } from '../js/core/achievements.js';

const NOW = Date.UTC(2026, 9, 5, 12);
const dummy = (score, extra = {}) => ({
  gameId: 'quickmath', mode: 'free', score, durationMs: 60000,
  items: [
    { skill: 'mental_arithmetic', difficulty: 850, correct: true, timeMs: 1000, targetMs: 4000 },
    { skill: 'percentages', difficulty: 1050, correct: false, timeMs: 5000, targetMs: 6000 },
  ],
  stats: { bestStreak: 3, maxLevel: 3, ...extra },
});

test('a dummy result flows through: rating, xp, history, best, first-rep achievement', () => {
  const s = defaultState();
  const sum = finalizeRun(s, dummy(300), { now: NOW });
  assert.equal(s.ratings.mental_arithmetic.n, 1);
  assert.ok(s.ratings.mental_arithmetic.r > 1000);
  assert.ok(s.ratings.percentages.r < 1000);
  assert.equal(s.xp, 35);
  assert.equal(s.history.length, 1);
  assert.deepEqual(s.bests.quickmath, { score: 300, at: NOW });
  assert.equal(s.counters.runs, 1);
  assert.deepEqual(sum.newAchievements.map((a) => a.id), ['first_rep']);
  assert.equal(sum.grade.name, 'Solid');
  assert.equal(sum.isPb, false); // first run
  assert.ok(sum.ratingDeltas.mental_arithmetic.after > sum.ratingDeltas.mental_arithmetic.before);
});

test('second better run is a PB with deltas', () => {
  const s = defaultState();
  finalizeRun(s, dummy(300), { now: NOW });
  const sum = finalizeRun(s, dummy(420), { now: NOW + 1000 });
  assert.ok(sum.isPb);
  assert.equal(sum.compare.deltaLast, 120);
  assert.equal(s.bests.quickmath.score, 420);
  assert.equal(sum.newAchievements.length, 0);
  const worse = finalizeRun(s, dummy(100), { now: NOW + 2000 });
  assert.equal(worse.isPb, false);
  assert.equal(s.bests.quickmath.score, 420);
});

test('daily-mode runs update ratings/xp but never personal bests', () => {
  const s = defaultState();
  const sum = finalizeRun(s, { ...dummy(500), mode: 'daily' }, { now: NOW });
  assert.deepEqual(s.bests, {});
  assert.equal(sum.compare, null);
  assert.equal(s.ratings.mental_arithmetic.n, 1);
});

test('practice replays change nothing', () => {
  const s = defaultState();
  const before = JSON.stringify(s);
  const sum = finalizeRun(s, dummy(999), { practice: true, now: NOW });
  assert.equal(JSON.stringify(s), before);
  assert.ok(sum.practice);
});

test('calibration samples and seen ids merge generically', () => {
  const s = defaultState();
  finalizeRun(s, { gameId: 'sure', mode: 'free', score: 100, durationMs: 1, items: [], stats: { calibration: [{ q: 0.9, correct: true }, { q: 0.55, correct: false }], seenIds: ['a', 'b'], answered: 2, brier: 0.1 } }, { now: NOW });
  assert.equal(s.calibration.buckets[4].n, 1);
  assert.equal(s.calibration.buckets[0].n, 1);
  assert.deepEqual(s.seen.sure, ['a', 'b']);
});

test('history is capped', () => {
  const s = defaultState();
  for (let i = 0; i < 320; i++) finalizeRun(s, dummy(i), { now: NOW + i });
  assert.equal(s.history.length, 300);
});

test('tier change is reported', () => {
  const s = defaultState();
  s.ratings.attention = { r: 1295, n: 40 };
  const sum = finalizeRun(s, { gameId: 'stroop', mode: 'free', score: 10, durationMs: 1, items: Array.from({ length: 30 }, () => ({ skill: 'attention', difficulty: 1300, correct: true, timeMs: 1, targetMs: 9 })), stats: {} }, { now: NOW });
  assert.deepEqual(sum.tierChanges, [{ skill: 'attention', from: 'Sharp', to: 'Elite' }]);
});

test('achievements: each fires on its condition only', () => {
  const s = defaultState();
  const has = (r) => evaluate(s, r);
  assert.equal(ACHIEVEMENTS.length, 10);
  assert.ok(!has(null).includes('first_rep'));
  s.counters.runs = 1;
  assert.ok(has(null).includes('first_rep'));
  assert.ok(has({ gameId: 'quickmath', mode: 'free', stats: { bestStreak: 20, maxLevel: 8 } }).includes('qm_streak_20'));
  assert.ok(has({ gameId: 'quickmath', mode: 'free', stats: { bestStreak: 20, maxLevel: 8 } }).includes('qm_level_8'));
  assert.ok(!has({ gameId: 'quickmath', mode: 'daily', stats: { bestStreak: 19, maxLevel: 8 } }).includes('qm_level_8'));
  assert.ok(!has({ gameId: 'quickmath', mode: 'daily', stats: { bestStreak: 19, maxLevel: 8 } }).includes('qm_streak_20'));
  assert.ok(has({ gameId: 'sure', stats: { answered: 8, brier: 0.09 } }).includes('calibrated'));
  assert.ok(!has({ gameId: 'sure', stats: { answered: 7, brier: 0.01 } }).includes('calibrated'));
  assert.ok(!has({ gameId: 'sure', stats: { answered: 10, brier: 0.1 } }).includes('calibrated'));
  assert.ok(has({ gameId: 'stroop', stats: { trials: 40, accuracy: 0.95 } }).includes('stroop_95'));
  assert.ok(!has({ gameId: 'stroop', stats: { trials: 39, accuracy: 1 } }).includes('stroop_95'));
  s.daily.best = 3;
  assert.ok(has(null).includes('streak_3') && !has(null).includes('streak_7'));
  s.daily.best = 7;
  assert.ok(has(null).includes('streak_7'));
  s.daily.completed = 10;
  assert.ok(has(null).includes('dailies_10'));
  s.ratings.estimation = { r: 1300, n: 5 };
  assert.ok(has(null).includes('elite_skill'));
  s.srs.italian = Object.fromEntries(Array.from({ length: 49 }, (_, i) => [`i${i}`, { box: 4 }]));
  assert.ok(!has(null).includes('vocab_50'));
  s.srs.russian = { r1: { box: 5 } };
  assert.ok(has(null).includes('vocab_50'));
});

test('already-unlocked achievements are not re-awarded', () => {
  const s = defaultState();
  finalizeRun(s, dummy(100), { now: NOW });
  const again = finalizeRun(s, dummy(100), { now: NOW + 1 });
  assert.equal(again.newAchievements.length, 0);
});
