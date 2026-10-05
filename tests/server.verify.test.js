import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/prng.js';
import { dailySeed, normalizeSegment, SEGMENTS } from '../js/core/daily.js';
import { initState, problemFor, tick, resolve, isOver } from '../js/games/quickmath/logic.js';
import { buildSet as ballparkSet } from '../js/games/ballpark/logic.js';
import { buildSet as sureSet } from '../js/games/sure/logic.js';
import { verifyQuickMath, verifyBallpark, verifySure, verifyDaily } from '../server/verify.js';

const DATE = '2026-10-05';

/** An honest QM player: answers every problem correctly, `ms` after it appears; wrongEvery makes some wrong. */
function playQuickMath(date, { ms = 900, wrongEvery = 0, skipEvery = 0 } = {}) {
  let s = initState({ mode: 'daily', durationMs: 45000 });
  const log = [];
  for (let i = 0; i < 400; i++) {
    s = tick(s, ms);
    if (isOver(s)) break;
    const p = problemFor(s, { seed: dailySeed(date, 'quickmath') });
    let v = p.answer;
    let outcome = 'correct';
    if (skipEvery && i % skipEvery === skipEvery - 1) (v = null), (outcome = 'skip');
    else if (wrongEvery && i % wrongEvery === wrongEvery - 1) (v = p.answer + 1), (outcome = 'wrong');
    log.push({ v, t: ms });
    s = resolve(s, outcome).state;
  }
  return { log, score: s.score };
}

const ballparkLog = (date, { exact = true, t = 5000 } = {}) =>
  ballparkSet(createRng(dailySeed(date, 'ballpark')), 5, []).map((q) => ({ e: exact ? q.truth : q.truth * 10, t }));
const sureLog = (date, { right = true, p = 90, t = 4000 } = {}) =>
  sureSet(createRng(dailySeed(date, 'sure')), 6, []).map((q) => ({ c: (q.answer === right) ? 'T' : 'F', p, t }));

test('Quick Math replay reproduces the client score exactly (clean, with wrongs and skips)', () => {
  for (const opts of [{}, { wrongEvery: 4 }, { skipEvery: 3, wrongEvery: 5 }, { ms: 400 }, { ms: 1500 }]) {
    const { log, score } = playQuickMath(DATE, opts);
    const r = verifyQuickMath(DATE, log);
    assert.ok(r.ok, r.error);
    assert.equal(r.score, score, JSON.stringify(opts));
    assert.ok(score > 0);
  }
});

test('Quick Math: content depends on the date (wrong-day log scores differently)', () => {
  const { log, score } = playQuickMath(DATE);
  const other = verifyQuickMath('2026-10-06', log);
  // on another day most of those answers are wrong, which costs time, so the log either scores less or becomes impossible
  assert.ok(!other.ok || other.score < score, 'answers for another day cannot reproduce the score');
});

test('Quick Math rejects impossible logs', () => {
  const { log } = playQuickMath(DATE);
  assert.equal(verifyQuickMath(DATE, [...log, ...log, ...log]).ok, false, 'more answers than the clock allows');
  assert.equal(verifyQuickMath(DATE, [{ v: 5, t: -1 }]).ok, false);
  assert.equal(verifyQuickMath(DATE, [{ v: 1.5, t: 100 }]).ok, false);
  assert.equal(verifyQuickMath(DATE, [{ v: 5, t: 'x' }]).ok, false);
  assert.equal(verifyQuickMath(DATE, []).ok, false);
  assert.equal(verifyQuickMath(DATE, 'nope').ok, false);
  assert.equal(verifyQuickMath(DATE, Array(600).fill({ v: 1, t: 1 })).ok, false);
  assert.equal(verifyQuickMath(DATE, [{ v: 1, t: 999999 }]).ok, false);
});

test('Quick Math: a forged "all correct" claim cannot invent points (server uses the problems, not claims)', () => {
  const lazy = Array.from({ length: 8 }, () => ({ v: 7, t: 1000 })); // always answers 7
  const r = verifyQuickMath(DATE, lazy);
  assert.ok(r.ok);
  assert.ok(r.score < 100, `score ${r.score}`);
  assert.equal(verifyQuickMath(DATE, Array.from({ length: 40 }, () => ({ v: 7, t: 1000 }))).ok, false, 'wrong answers burn the clock, so a long all-wrong log is impossible');
});

test('Ballpark: exact answers score 125+speed each; wrong count/garbage rejected', () => {
  const r = verifyBallpark(DATE, ballparkLog(DATE, { t: 25000 }));
  assert.ok(r.ok);
  assert.equal(r.score, 5 * 125);
  const sloppy = verifyBallpark(DATE, ballparkLog(DATE, { exact: false }));
  assert.ok(sloppy.score < r.score);
  assert.equal(verifyBallpark(DATE, ballparkLog(DATE).slice(0, 4)).ok, false);
  assert.equal(verifyBallpark(DATE, [...ballparkLog(DATE).slice(0, 4), { e: -3, t: 1 }]).ok, false);
  assert.equal(verifyBallpark(DATE, [...ballparkLog(DATE).slice(0, 4), { e: 'x', t: 1 }]).ok, false);
});

test('Sure: right at 90 = +96 each, wrong = −224, timeouts = 0; bad confidence rejected', () => {
  assert.equal(verifySure(DATE, sureLog(DATE)).score, 6 * 96);
  assert.equal(verifySure(DATE, sureLog(DATE, { right: false })).score, 6 * -224);
  const withTimeout = sureLog(DATE);
  withTimeout[0] = { c: null, p: 50, t: 20000 };
  assert.equal(verifySure(DATE, withTimeout).score, 5 * 96);
  assert.equal(verifySure(DATE, sureLog(DATE, { p: 100 })).ok, false);
  assert.equal(verifySure(DATE, sureLog(DATE, { p: 49 })).ok, false);
  assert.equal(verifySure(DATE, sureLog(DATE).slice(1)).ok, false);
  assert.equal(verifySure(DATE, sureLog(DATE).map((e) => ({ ...e, c: 'X' }))).ok, false);
});

test('verifyDaily combines normalised segments (0–333 each) and flags superhuman timing', () => {
  const qm = playQuickMath(DATE, { ms: 900 });
  const answers = { quickmath: qm.log, ballpark: ballparkLog(DATE), sure: sureLog(DATE) };
  const v = verifyDaily(DATE, answers);
  assert.ok(v.ok);
  assert.equal(v.normalized.quickmath, normalizeSegment('quickmath', qm.score));
  assert.equal(v.total, v.normalized.quickmath + v.normalized.ballpark + v.normalized.sure);
  assert.ok(Object.values(v.normalized).every((x) => x >= 0 && x <= 333));
  assert.deepEqual(v.flags, []);
  const bot = verifyDaily(DATE, { ...answers, ballpark: ballparkLog(DATE, { t: 5 }) });
  assert.deepEqual(bot.flags, ['ballpark: implausibly fast']);
  assert.equal(verifyDaily(DATE, { ...answers, sure: undefined }).ok, false);
  assert.equal(verifyDaily(DATE, null).ok, false);
  assert.equal(SEGMENTS.length, 3);
});
