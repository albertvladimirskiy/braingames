import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dailySeed, utcDate, daysBetween, addDays, normalizeSegment, nextReset, emptyDaily, recordDaily, liveStreak, shareText,
} from '../js/core/daily.js';
import { createRng } from '../js/core/prng.js';

const S = (a = 100, b = 100, c = 100) => ({ quickmath: a, ballpark: b, sure: c });

test('seed format and determinism across players', () => {
  assert.equal(dailySeed('2026-10-05', 'quickmath'), 'daily:2026-10-05:quickmath');
  const a = createRng(dailySeed('2026-10-05', 'ballpark'));
  const b = createRng(dailySeed('2026-10-05', 'ballpark'));
  assert.deepEqual(Array.from({ length: 5 }, a.next), Array.from({ length: 5 }, b.next));
  assert.notEqual(createRng(dailySeed('2026-10-06', 'ballpark')).next(), createRng(dailySeed('2026-10-05', 'ballpark')).next());
});

test('UTC date handling at month / year / leap boundaries', () => {
  assert.equal(utcDate(Date.UTC(2026, 9, 31, 23, 59, 59, 999)), '2026-10-31');
  assert.equal(utcDate(Date.UTC(2026, 10, 1)), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2027-02-28', 1), '2027-03-01');
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(daysBetween('2028-02-28', '2028-03-01'), 2);
  assert.equal(daysBetween('2026-10-05', '2026-10-05'), 0);
  assert.equal(daysBetween('2026-10-05', '2026-10-01'), -4);
});

test('nextReset is the next UTC midnight', () => {
  const now = Date.UTC(2026, 9, 5, 22, 30, 0);
  const r = nextReset(now);
  assert.equal(r.at, Date.UTC(2026, 9, 6));
  assert.equal(r.ms, 90 * 60 * 1000);
  assert.equal(nextReset(Date.UTC(2026, 9, 5)).ms, 86400000);
});

test('segments normalize to 0–333 and clamp', () => {
  assert.equal(normalizeSegment('quickmath', 0), 0);
  assert.equal(normalizeSegment('quickmath', -40), 0);
  assert.equal(normalizeSegment('quickmath', 600), 333);
  assert.equal(normalizeSegment('quickmath', 9999), 333);
  assert.equal(normalizeSegment('sure', 300), 167);
});

test('first completion starts a streak of 1 and counts', () => {
  const r = recordDaily(emptyDaily(), '2026-10-05', S());
  assert.ok(r.counted);
  assert.equal(r.streak, 1);
  assert.equal(r.total, 300);
  assert.equal(r.daily.completed, 1);
  assert.equal(r.daily.lastDate, '2026-10-05');
});

test('replay on the same UTC day does not count and changes nothing', () => {
  const first = recordDaily(emptyDaily(), '2026-10-05', S(300, 300, 300)).daily;
  const again = recordDaily(first, '2026-10-05', S(1, 1, 1));
  assert.equal(again.counted, false);
  assert.equal(again.daily, first);
  assert.equal(first.results['2026-10-05'].total, 900);
});

test('consecutive days extend the streak', () => {
  let d = emptyDaily();
  for (const day of ['2026-10-05', '2026-10-06', '2026-10-07']) d = recordDaily(d, day, S()).daily;
  assert.equal(d.streak, 3);
  assert.equal(d.best, 3);
});

test('streak crosses month and year boundaries', () => {
  let d = emptyDaily();
  for (const day of ['2026-12-30', '2026-12-31', '2027-01-01']) d = recordDaily(d, day, S()).daily;
  assert.equal(d.streak, 3);
});

test('a freeze is earned at 7 (max 2) and auto-consumed on a missed day', () => {
  let d = emptyDaily();
  for (let i = 0; i < 7; i++) d = recordDaily(d, addDays('2026-10-01', i), S()).daily;
  assert.equal(d.streak, 7);
  assert.equal(d.freezes, 1);
  // miss 2026-10-08, play 2026-10-09
  const r = recordDaily(d, '2026-10-09', S());
  assert.equal(r.frozen, 1);
  assert.equal(r.daily.streak, 8);
  assert.equal(r.daily.freezes, 0);
});

test('freezes cap at 2', () => {
  let d = emptyDaily();
  for (let i = 0; i < 21; i++) d = recordDaily(d, addDays('2026-10-01', i), S()).daily;
  assert.equal(d.streak, 21);
  assert.equal(d.freezes, 2);
});

test('missing more days than freezes resets the streak and keeps freezes', () => {
  let d = emptyDaily();
  for (let i = 0; i < 7; i++) d = recordDaily(d, addDays('2026-10-01', i), S()).daily; // 1 freeze
  const r = recordDaily(d, '2026-10-12', S()); // missed 4 days
  assert.equal(r.daily.streak, 1);
  assert.equal(r.daily.freezes, 1);
});

test('liveStreak shows an alive streak, a frozen one, and a broken one', () => {
  let d = emptyDaily();
  for (let i = 0; i < 7; i++) d = recordDaily(d, addDays('2026-10-01', i), S()).daily; // lastDate 10-07, 1 freeze
  assert.equal(liveStreak(d, '2026-10-07'), 7);
  assert.equal(liveStreak(d, '2026-10-08'), 7); // yesterday done, today pending
  assert.equal(liveStreak(d, '2026-10-09'), 7); // one missed day covered by the freeze
  assert.equal(liveStreak(d, '2026-10-10'), 0); // two missed, one freeze
  assert.equal(liveStreak(emptyDaily(), '2026-10-10'), 0);
});

test('share text matches the spec format exactly', () => {
  const txt = shareText({ date: '2026-10-05', scores: S(412, 288, 301), total: 1001, streak: 6 });
  assert.equal(txt, 'Reps Daily 2026-10-05\nMath 412 | Ballpark 288 | Sure 301\nTotal 1001 | Streak 6');
});
