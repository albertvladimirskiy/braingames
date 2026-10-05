import test from 'node:test';
import assert from 'node:assert/strict';
import { multiplier, applyCorrect, xpForScore, levelInfo } from '../js/core/scoring.js';

test('multiplier steps every 5 and caps at 4', () => {
  const m = [0, 4, 5, 9, 10, 14, 15, 19, 99].map(multiplier);
  assert.deepEqual(m, [1, 1, 2, 2, 3, 3, 4, 4, 4]);
});

test('applyCorrect uses streak BEFORE increment for the multiplier', () => {
  const r = applyCorrect(4, 10); // 5th correct: mult still 1
  assert.equal(r.points, 10);
  assert.equal(r.streak, 5);
  assert.ok(r.milestone);
  assert.equal(r.bonusMs, 2000);
  const next = applyCorrect(5, 10); // 6th: mult 2
  assert.equal(next.points, 20);
  assert.equal(next.bonusMs, 0);
});

test('+2s on every 5th consecutive correct only', () => {
  let streak = 0, bonuses = 0;
  for (let i = 0; i < 20; i++) {
    const r = applyCorrect(streak, 10);
    streak = r.streak;
    bonuses += r.bonusMs;
  }
  assert.equal(bonuses, 8000);
});

test('xp and level', () => {
  assert.equal(xpForScore(0), 5);
  assert.equal(xpForScore(-50), 5);
  assert.equal(xpForScore(300), 35);
  assert.equal(levelInfo(0).level, 1);
  assert.equal(levelInfo(49).level, 1);
  assert.equal(levelInfo(50).level, 2);
  assert.equal(levelInfo(200).level, 3);
  const li = levelInfo(125);
  assert.equal(li.level, 2);
  assert.equal(li.into, 75);
  assert.equal(li.needed, 150);
});
