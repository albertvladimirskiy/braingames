import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/prng.js';
import {
  generate, initState, resolve, levelOf, problemFor, tick, isOver, basePoints, itemDifficulty, targetMs, MAX_LEVEL,
} from '../js/games/quickmath/logic.js';

const N = 2000;
const mult = (k, n, step) => Number.isInteger(n / step) && n >= k[0] && n <= k[1];
const within = (n, [lo, hi]) => n >= lo && n <= hi;

const r9 = (x) => Math.round(x * 1e9) / 1e9; // kill float noise from the deliberately different formulation below

/** Independent recomputation of the answer from structured parts. */
function recompute(p) {
  const { kind, parts: q } = p;
  switch (kind) {
    case 'add': return q.a + q.b;
    case 'sub': return q.a - q.b;
    case 'mul': return q.a * q.b;
    case 'pctOf': return r9((q.base / 100) * q.pct);
    case 'tip': return r9((q.bill / 100) * q.pct);
    case 'discount': return r9(q.price - (q.price / 100) * q.pct);
    case 'pctChange': return Math.round((Math.abs(q.to - q.from) / q.from) * 100);
    default: throw new Error(`unknown kind ${kind}`);
  }
}

/** Range rules straight from the spec, per level. */
const RULES = {
  1: { add: (q) => within(q.a, [2, 19]) && within(q.b, [2, 19]), sub: (q) => within(q.a, [8, 25]) && within(q.b, [2, q.a - 1]) },
  2: { add: (q) => within(q.a, [12, 89]) && within(q.b, [12, 89]), sub: (q) => within(q.a, [30, 99]) && within(q.b, [11, q.a - 1]) },
  3: { mul: (q) => within(q.a, [3, 12]) && within(q.b, [3, 12]) },
  4: {
    mul: (q) => within(q.a, [12, 29]) && within(q.b, [3, 9]),
    pctOf: (q) => [10, 50].includes(q.pct) && mult([20, 400], q.base, 10),
  },
  5: {
    pctOf: (q) => [5, 10, 15, 20, 25].includes(q.pct) && mult([40, 400], q.base, 20),
    tip: (q) => [15, 20, 25].includes(q.pct) && mult([40, 300], q.bill, 20),
  },
  6: { discount: (q) => mult([40, 300], q.price, 20) && [10, 15, 20, 25, 30, 40, 50].includes(q.pct) },
  7: { add: (q) => within(q.a, [100, 899]) && within(q.b, [100, 899]), sub: (q) => within(q.a, [200, 999]) && within(q.b, [100, q.a - 1]) },
  8: { pctChange: (q) => mult([20, 200], q.from, 20) && [5, 10, 15, 20, 25, 50].includes(q.pct) && (q.dir === 'up' ? q.to > q.from : q.to < q.from) },
};

for (let level = 1; level <= MAX_LEVEL; level++) {
  test(`level ${level}: ${N} seeded samples are integer, non-negative, correct and in range`, () => {
    const rng = createRng(`ql${level}`);
    const kinds = new Set();
    for (let i = 0; i < N; i++) {
      const p = generate(level, rng);
      kinds.add(p.kind);
      assert.equal(p.level, level);
      assert.ok(Number.isInteger(p.answer), `${p.text} → ${p.answer}`);
      assert.ok(p.answer >= 0, `${p.text} negative`);
      assert.equal(p.answer, recompute(p), `${p.text}`);
      const rule = RULES[level][p.kind];
      assert.ok(rule, `unexpected kind ${p.kind} at level ${level}`);
      assert.ok(rule(p.parts), `${p.text} out of range ${JSON.stringify(p.parts)}`);
      assert.ok(p.text.length > 0 && /^[\x20-\x7e−×→]+$/.test(p.text), `odd characters in ${p.text}`);
    }
    assert.deepEqual([...kinds].sort(), Object.keys(RULES[level]).sort(), 'every problem type is generated');
  });
}

test('percent-change wording matches direction', () => {
  const rng = createRng('pc');
  for (let i = 0; i < 300; i++) {
    const p = generate(8, rng);
    assert.ok(p.text.endsWith(p.parts.dir === 'up' ? '% up?' : '% down?'));
  }
});

test('rating mapping: difficulty, target time, skill', () => {
  assert.equal(itemDifficulty(1), 850);
  assert.equal(itemDifficulty(8), 1550);
  assert.equal(targetMs(1), 3750);
  assert.equal(targetMs(8), 9000);
  const rng = createRng('sk');
  const skillAt = (l) => new Set(Array.from({ length: 200 }, () => generate(l, rng).skill));
  for (const l of [1, 2, 3, 7]) assert.deepEqual([...skillAt(l)], ['mental_arithmetic']);
  for (const l of [5, 6, 8]) assert.deepEqual([...skillAt(l)], ['percentages']);
  assert.deepEqual([...skillAt(4)].sort(), ['mental_arithmetic', 'percentages']);
});

test('base points = 10 + 5·(level−1)', () => {
  assert.deepEqual([1, 2, 3, 8].map(basePoints), [10, 15, 20, 45]);
});

const play = (s, outcomes) => outcomes.reduce((acc, o) => {
  const r = resolve(acc.state, o);
  return { state: r.state, log: [...acc.log, r] };
}, { state: s, log: [] });

test('points use the multiplier from the streak BEFORE incrementing; +2s on every 5th', () => {
  const s0 = initState({ startLevel: 3 });
  const { state, log } = play(s0, Array(12).fill('correct'));
  // base at L3 = 20; levels rise every 4 correct (L3→L4 at 4th, L4→L5 at 8th, L5→L6 at 12th)
  assert.equal(log[0].points, 20 * 1);
  assert.equal(log[4].multiplier, 1, '5th answer: streak before is 4');
  assert.equal(log[5].multiplier, 2, '6th answer: streak before is 5');
  assert.deepEqual(log.map((r) => r.bonusMs), [0, 0, 0, 0, 2000, 0, 0, 0, 0, 2000, 0, 0]);
  assert.equal(state.streak, 12);
  assert.equal(state.timeLeftMs, 60000 + 4000);
});

test('multiplier caps at ×4', () => {
  const { log } = play(initState({ startLevel: 1 }), Array(40).fill('correct'));
  assert.equal(Math.max(...log.map((r) => r.multiplier)), 4);
  assert.equal(log[39].multiplier, 4);
});

test('wrong: −3s and streak reset; skip: −1s and streak reset', () => {
  let { state } = play(initState({ startLevel: 3 }), ['correct', 'correct', 'correct']);
  const w = resolve(state, 'wrong');
  assert.equal(w.state.timeLeftMs, 57000);
  assert.equal(w.state.streak, 0);
  assert.equal(w.state.wrong, 1);
  assert.equal(w.penaltyMs, 3000);
  const k = resolve(state, 'skip');
  assert.equal(k.state.timeLeftMs, 59000);
  assert.equal(k.state.streak, 0);
  assert.equal(k.state.skipped, 1);
});

test('time never goes below zero from penalties', () => {
  const s = { ...initState(), timeLeftMs: 500 };
  assert.equal(resolve(s, 'wrong').state.timeLeftMs, 0);
  assert.ok(isOver(resolve(s, 'wrong').state));
});

test('adaptive: level up after 4 consecutive correct, run counter resets, cap at 8', () => {
  let r = play(initState({ startLevel: 3 }), ['correct', 'correct', 'correct']);
  assert.equal(r.state.level, 3);
  r = play(r.state, ['correct']);
  assert.equal(r.state.level, 4);
  assert.equal(r.state.runAtLevel, 0);
  assert.equal(r.log[0].levelChange, 1);
  assert.equal(play(initState({ startLevel: 8 }), Array(10).fill('correct')).state.level, 8);
  assert.equal(play(initState({ startLevel: 7 }), Array(4).fill('correct')).state.maxLevel, 8);
});

test('adaptive: a miss breaks the run toward level-up', () => {
  const r = play(initState({ startLevel: 3 }), ['correct', 'correct', 'correct', 'wrong', 'correct']);
  assert.equal(r.state.level, 3);
  assert.equal(r.state.runAtLevel, 1);
});

test('adaptive: 2 consecutive misses drop a level (floor 1); correct in between prevents it', () => {
  let r = play(initState({ startLevel: 3 }), ['wrong']);
  assert.equal(r.state.level, 3);
  r = play(r.state, ['wrong']);
  assert.equal(r.state.level, 2);
  assert.equal(r.log[0].levelChange, -1);
  assert.equal(play(initState({ startLevel: 1 }), ['wrong', 'wrong', 'wrong', 'wrong']).state.level, 1);
  assert.equal(play(initState({ startLevel: 3 }), ['wrong', 'correct', 'wrong']).state.level, 3);
  assert.equal(play(initState({ startLevel: 3 }), ['skip', 'wrong']).state.level, 2, 'skip counts as a miss');
});

test('daily: fixed ramp level = min(8, 2 + floor(i/4)), never adapts', () => {
  const s = initState({ mode: 'daily', durationMs: 45000 });
  const levels = [];
  let st = s;
  for (let i = 0; i < 30; i++) {
    levels.push(levelOf(st));
    st = resolve(st, i % 3 === 0 ? 'wrong' : 'correct').state;
  }
  assert.deepEqual(levels.slice(0, 9), [2, 2, 2, 2, 3, 3, 3, 3, 4]);
  assert.equal(levels[24], 8);
  assert.equal(levels[29], 8);
  assert.equal(st.level, s.level, 'adaptive level untouched');
});

test('daily problems depend only on seed + index (identical for everyone)', () => {
  const seed = 'daily:2026-10-05:quickmath';
  const seq = (rngSeed) => {
    let st = initState({ mode: 'daily' });
    const out = [];
    for (let i = 0; i < 25; i++) {
      out.push(problemFor(st, { rng: createRng(rngSeed), seed }).text);
      st = resolve(st, 'correct').state;
    }
    return out;
  };
  assert.deepEqual(seq('player-a'), seq('player-b'));
  const first = (sd) => Array.from({ length: 8 }, (_, i) => problemFor({ ...initState({ mode: 'daily' }), index: i }, { seed: sd }).text).join('|');
  assert.notEqual(first('daily:2026-10-06:quickmath'), first(seed), 'a different day gives different problems');
});

test('free mode avoids an immediate repeat of the previous problem', () => {
  const st = initState({ startLevel: 3 });
  const rng = createRng('rep');
  let prev = null;
  for (let i = 0; i < 300; i++) {
    const p = problemFor(st, { rng, prevText: prev });
    assert.notEqual(p.text, prev);
    prev = p.text;
  }
});

test('tick/isOver and max-level tracking', () => {
  assert.ok(isOver(tick({ timeLeftMs: 100 }, 100)));
  assert.ok(!isOver(tick({ timeLeftMs: 100 }, 99)));
  const r = play(initState({ startLevel: 5 }), Array(4).fill('correct'));
  assert.equal(r.state.maxLevel, 6);
  assert.equal(play(r.state, ['wrong', 'wrong']).state.maxLevel, 6, 'max level is sticky');
});
