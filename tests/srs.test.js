import test from 'node:test';
import assert from 'node:assert/strict';
import { review, buildQueue, practiceQueue, deckProgress, isDue, INTERVALS, NEW_CAP, dayIndex } from '../js/core/srs.js';
import { createRng } from '../js/core/prng.js';

const entries = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}` }));
const today = 20000;

test('intervals are 0,1,3,7,14', () => assert.deepEqual(INTERVALS, [0, 1, 3, 7, 14]));

test('new card answered right goes to box 2, due in 1 day', () => {
  const c = review(undefined, true, today);
  assert.deepEqual(c, { box: 2, due: today + 1, lapses: 0, seen: 1 });
});

test('correct climbs one box at a time and caps at 5', () => {
  let c = undefined;
  const boxes = [];
  for (let i = 0; i < 7; i++) boxes.push((c = review(c, true, today)).box);
  assert.deepEqual(boxes, [2, 3, 4, 5, 5, 5, 5]);
  assert.equal(c.due, today + 14);
});

test('wrong resets to box 1, records a lapse, due now', () => {
  let c = review(review(review(undefined, true, today), true, today), true, today); // box 4
  c = review(c, false, today);
  assert.equal(c.box, 1);
  assert.equal(c.lapses, 1);
  assert.equal(c.due, today);
  assert.equal(review(c, false, today).lapses, 2);
});

test('review does not mutate the old card', () => {
  const c = { box: 2, due: 5, lapses: 0, seen: 1 };
  review(c, true, 6);
  assert.deepEqual(c, { box: 2, due: 5, lapses: 0, seen: 1 });
});

test('isDue', () => {
  assert.ok(isDue({ due: today }, today));
  assert.ok(!isDue({ due: today + 1 }, today));
  assert.ok(!isDue(undefined, today));
});

test('queue: due first (earliest, then lowest box), then at most 5 new', () => {
  const cards = {
    c0: { box: 3, due: today - 1, lapses: 0, seen: 3 },
    c1: { box: 1, due: today - 5, lapses: 1, seen: 3 },
    c2: { box: 2, due: today - 1, lapses: 0, seen: 3 },
    c3: { box: 4, due: today + 3, lapses: 0, seen: 3 }, // not due
  };
  const q = buildQueue(entries, cards, today, createRng('q'));
  assert.deepEqual(q.slice(0, 3).map((e) => e.id), ['c1', 'c2', 'c0']);
  assert.ok(!q.some((e) => e.id === 'c3'));
  const fresh = q.slice(3);
  assert.equal(fresh.length, NEW_CAP);
  assert.ok(fresh.every((e) => !cards[e.id]));
});

test('queue is deterministic for a seed and respects a custom cap', () => {
  const a = buildQueue(entries, {}, today, createRng('z'), { newCap: 3 });
  const b = buildQueue(entries, {}, today, createRng('z'), { newCap: 3 });
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
});

test('practiceQueue prefers low boxes and honours exclusion', () => {
  const cards = { c0: { box: 4, due: today + 9 }, c1: { box: 1, due: today + 1 }, c2: { box: 2, due: today + 1 } };
  const q = practiceQueue(entries, cards, createRng('p'), ['c2']);
  assert.deepEqual(q.map((e) => e.id), ['c1', 'c0']);
});

test('deckProgress counts new / learning / mastered / due', () => {
  const cards = {
    c0: { box: 5, due: today + 14 },
    c1: { box: 4, due: today - 1 },
    c2: { box: 1, due: today },
    c3: { box: 3, due: today + 3 },
  };
  assert.deepEqual(deckProgress(entries, cards, today), { total: 20, new: 16, learning: 2, mastered: 2, due: 2 });
});

test('dayIndex is UTC based', () => {
  assert.equal(dayIndex(Date.UTC(1970, 0, 2, 23, 59)), 1);
  assert.equal(dayIndex(Date.UTC(1970, 0, 3, 0, 0)), 2);
});
