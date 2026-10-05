import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ratingTier, gradeOf, compareToHistory, GAME_GRADES, DAY_MS } from '../js/core/benchmarks.js';

test('rating tier boundaries', () => {
  const t = (r) => ratingTier(r).name;
  assert.deepEqual([899, 900, 1099, 1100, 1299, 1300, 2400].map(t), ['Rookie', 'Solid', 'Solid', 'Sharp', 'Sharp', 'Elite', 'Elite']);
});

test('points to next tier', () => {
  const x = ratingTier(1086);
  assert.equal(x.next, 'Sharp');
  assert.equal(x.toNext, 14);
  assert.equal(ratingTier(1500).next, null);
});

test('Quick Math grade cutoffs 200/400/700', () => {
  const g = (s) => gradeOf('quickmath', s).name;
  assert.deepEqual([0, 199, 200, 399, 400, 699, 700, 5000].map(g), ['Rookie', 'Rookie', 'Solid', 'Solid', 'Sharp', 'Sharp', 'Elite', 'Elite']);
  assert.equal(gradeOf('quickmath', 386).toNext, 14);
  assert.equal(gradeOf('quickmath', 386).next, 'Sharp');
});

test('every game with a grade table is ascending and unknown games return null', () => {
  for (const cut of Object.values(GAME_GRADES)) assert.ok(cut[0] < cut[1] && cut[1] < cut[2]);
  assert.equal(gradeOf('nope', 5), null);
});

test('every cutoff line is marked as a placeholder', () => {
  const src = readFileSync(new URL('../js/core/benchmarks.js', import.meta.url), 'utf8');
  const lines = src.split('\n').filter((l) => /^\s+(\{ name|\w+: \[)/.test(l));
  assert.ok(lines.length >= 10);
  for (const l of lines) assert.match(l, /PLACEHOLDER: calibrate from real play data/);
});

test('compareToHistory: last, PB, 7-day average (free runs of that game only)', () => {
  const now = 100 * DAY_MS;
  const history = [
    { gameId: 'quickmath', mode: 'free', score: 300, at: now - 20 * DAY_MS },
    { gameId: 'quickmath', mode: 'free', score: 500, at: now - 3 * DAY_MS },
    { gameId: 'quickmath', mode: 'free', score: 200, at: now - 1 * DAY_MS },
    { gameId: 'quickmath', mode: 'daily', score: 999, at: now - 1 * DAY_MS },
    { gameId: 'stroop', mode: 'free', score: 999, at: now - 1 * DAY_MS },
  ];
  const c = compareToHistory(history, 'quickmath', 450, now);
  assert.equal(c.last, 200);
  assert.equal(c.pb, 500);
  assert.equal(c.avg7, 350);
  assert.equal(c.deltaLast, 250);
  assert.equal(c.deltaPb, -50);
  assert.equal(c.deltaAvg, 100);
  assert.equal(c.isPb, false);
  assert.equal(compareToHistory(history, 'quickmath', 501, now).isPb, true);
});

test('first run has no comparison and is not flagged a PB', () => {
  const c = compareToHistory([], 'quickmath', 300, 0);
  assert.deepEqual([c.last, c.pb, c.avg7, c.isPb], [null, null, null, false]);
});
