import test from 'node:test';
import assert from 'node:assert/strict';
import { expected, kFor, updateRating, itemSignal, applyItems, getRating } from '../js/core/rating.js';

test('expected is 0.5 at equal rating and monotone', () => {
  assert.equal(expected(1000, 1000), 0.5);
  assert.ok(expected(1200, 1000) > 0.7);
  assert.ok(expected(800, 1000) < 0.3);
  assert.ok(Math.abs(expected(1400, 1000) - 10 / 11) < 1e-9);
});

test('correct raises, wrong lowers; harder items move more', () => {
  const start = { r: 1000, n: 0 };
  assert.ok(updateRating(start, { difficulty: 1000, s: 1 }).r > 1000);
  assert.ok(updateRating(start, { difficulty: 1000, s: 0 }).r < 1000);
  const hard = updateRating(start, { difficulty: 1300, s: 1 }).r - 1000;
  const easy = updateRating(start, { difficulty: 800, s: 1 }).r - 1000;
  assert.ok(hard > easy);
});

test('K = 24 for first 30 items, then 12', () => {
  assert.equal(kFor(0), 24);
  assert.equal(kFor(29), 24);
  assert.equal(kFor(30), 12);
  const early = updateRating({ r: 1000, n: 29 }, { difficulty: 1000, s: 1 });
  const late = updateRating({ r: 1000, n: 30 }, { difficulty: 1000, s: 1 });
  assert.equal(early.r - 1000, 12); // 24 * 0.5
  assert.equal(late.r - 1000, 6); // 12 * 0.5
  assert.equal(early.n, 30);
});

test('floor 400 and cap 2400', () => {
  assert.equal(updateRating({ r: 400, n: 0 }, { difficulty: 400, s: 0 }).r, 400); // would be 388 unclamped
  assert.equal(updateRating({ r: 2400, n: 0 }, { difficulty: 2400, s: 1 }).r, 2400); // would be 2412
  let lo = { r: 405, n: 0 };
  for (let i = 0; i < 50; i++) lo = updateRating(lo, { difficulty: 400, s: 0 });
  assert.equal(lo.r, 400);
  let hi = { r: 2395, n: 0 };
  for (let i = 0; i < 50; i++) hi = updateRating(hi, { difficulty: 2400, s: 1 });
  assert.equal(hi.r, 2400);
});

test('explicit k override (calibration)', () => {
  const a = updateRating({ r: 1000, n: 0 }, { difficulty: 1100, s: 1, k: 40 });
  assert.ok(Math.abs(a.r - (1000 + 40 * (1 - expected(1000, 1100)))) < 1e-9);
});

test('itemSignal: 1 fast, 0.75 slow, 0 wrong, graded s wins', () => {
  assert.equal(itemSignal({ correct: true, timeMs: 1000, targetMs: 2000 }), 1);
  assert.equal(itemSignal({ correct: true, timeMs: 3000, targetMs: 2000 }), 0.75);
  assert.equal(itemSignal({ correct: false, timeMs: 100, targetMs: 2000 }), 0);
  assert.equal(itemSignal({ correct: false, s: 0.4 }), 0.4);
  assert.equal(itemSignal({ s: 7 }), 1);
});

test('applyItems tracks deltas, skips noRating, defaults skill to 1000', () => {
  const { ratings, deltas } = applyItems({}, [
    { skill: 'mental_arithmetic', difficulty: 850, correct: true, timeMs: 1, targetMs: 5 },
    { skill: 'mental_arithmetic', difficulty: 850, correct: false },
    { skill: 'calibration', difficulty: 1000, correct: true, noRating: true },
    { skill: 'calibration', difficulty: 1100, s: 0.8, k: 40 },
  ]);
  assert.equal(ratings.mental_arithmetic.n, 2);
  assert.equal(deltas.mental_arithmetic.items, 2);
  assert.equal(deltas.mental_arithmetic.before, 1000);
  assert.equal(ratings.calibration.n, 1);
  assert.equal(getRating({}, 'attention').r, 1000);
});

test('applyItems does not mutate its input', () => {
  const input = { attention: { r: 1000, n: 1 } };
  applyItems(input, [{ skill: 'attention', difficulty: 900, correct: true }]);
  assert.deepEqual(input, { attention: { r: 1000, n: 1 } });
});
