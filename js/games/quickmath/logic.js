// Quick Math: problem generators (levels 1–8) and the scoring / adaptation state machine. Pure, DOM-free.
import { applyCorrect, multiplier } from '../../core/scoring.js';
import { createRng } from '../../core/prng.js';

export const MAX_LEVEL = 8;
export const WRONG_PENALTY_MS = 3000;
export const SKIP_PENALTY_MS = 1000;
export const LEVEL_UP_RUN = 4;
export const MISS_DROP_RUN = 2;

export const basePoints = (level) => 10 + 5 * (level - 1);
export const itemDifficulty = (level) => 750 + 100 * level;
export const targetMs = (level) => 3000 + 750 * level;

const SKILL_OF = {
  add: 'mental_arithmetic', sub: 'mental_arithmetic', mul: 'mental_arithmetic',
  pctOf: 'percentages', tip: 'percentages', discount: 'percentages', pctChange: 'percentages',
};
const MINUS = '−';
const TIMES = '×';
const TIP_PCTS = [15, 20, 25];
const PCT_OF = [5, 10, 15, 20, 25];
const DISCOUNTS = [10, 15, 20, 25, 30, 40, 50];
const CHANGES = [5, 10, 15, 20, 25, 50];

const mk = (level, kind, text, answer, parts) => ({ level, kind, skill: SKILL_OF[kind], text, answer, parts });

function addSub(level, rng, addRange, subARange, subBMin) {
  if (rng.chance(0.5)) {
    const a = rng.int(...addRange);
    const b = rng.int(...addRange);
    return mk(level, 'add', `${a} + ${b}`, a + b, { a, b });
  }
  const a = rng.int(...subARange);
  const b = rng.int(subBMin, a - 1);
  return mk(level, 'sub', `${a} ${MINUS} ${b}`, a - b, { a, b });
}

const pctOf = (level, pct, base, text) => mk(level, 'pctOf', text ?? `${pct}% of ${base}`, (base * pct) / 100, { pct, base });
const mul = (level, a, b) => mk(level, 'mul', `${a} ${TIMES} ${b}`, a * b, { a, b });

const GENERATORS = {
  1: (rng) => addSub(1, rng, [2, 19], [8, 25], 2),
  2: (rng) => addSub(2, rng, [12, 89], [30, 99], 11),
  3: (rng) => mul(3, rng.int(3, 12), rng.int(3, 12)),
  4(rng) {
    if (rng.chance(0.5)) return mul(4, rng.int(12, 29), rng.int(3, 9));
    return pctOf(4, rng.pick([10, 50]), 10 * rng.int(2, 40));
  },
  5(rng) {
    if (rng.chance(0.5)) return pctOf(5, rng.pick(PCT_OF), 20 * rng.int(2, 20));
    const pct = rng.pick(TIP_PCTS);
    const bill = 20 * rng.int(2, 15);
    return mk(5, 'tip', `${pct}% tip on a $${bill} bill`, (bill * pct) / 100, { pct, bill });
  },
  6(rng) {
    const price = 20 * rng.int(2, 15);
    const pct = rng.pick(DISCOUNTS);
    return mk(6, 'discount', `$${price} item, ${pct}% off. Sale price?`, (price * (100 - pct)) / 100, { price, pct });
  },
  7: (rng) => addSub(7, rng, [100, 899], [200, 999], 100),
  8(rng) {
    const base = 20 * rng.int(1, 10);
    const pct = rng.pick(CHANGES);
    const up = rng.chance(0.5);
    const to = (base * (100 + (up ? pct : -pct))) / 100;
    return mk(8, 'pctChange', `${base} → ${to}. How many % ${up ? 'up' : 'down'}?`, pct, { from: base, to, pct, dir: up ? 'up' : 'down' });
  },
};

export const generate = (level, rng) => GENERATORS[level](rng);

// ---- state machine -------------------------------------------------------------------------

export function initState({ mode = 'free', startLevel = 3, durationMs = 60000 } = {}) {
  return {
    mode, level: startLevel, runAtLevel: 0, missRun: 0, streak: 0, bestStreak: 0,
    timeLeftMs: durationMs, durationMs, score: 0, correct: 0, wrong: 0, skipped: 0,
    maxLevel: mode === 'daily' ? Math.min(MAX_LEVEL, 2) : startLevel, index: 0,
  };
}

/** Daily is a fixed ramp (non-adaptive); free play uses the adaptive level. */
export const levelOf = (s) => (s.mode === 'daily' ? Math.min(MAX_LEVEL, 2 + Math.floor(s.index / 4)) : s.level);

/** Next problem. Daily problems derive from seed + index so every player sees the same sequence. */
export function problemFor(state, { rng, seed, prevText }) {
  const level = levelOf(state);
  if (state.mode === 'daily') return generate(level, createRng(`${seed}:${state.index}`));
  let p = generate(level, rng);
  for (let i = 0; i < 5 && p.text === prevText; i++) p = generate(level, rng);
  return p;
}

export const tick = (s, dtMs) => ({ ...s, timeLeftMs: s.timeLeftMs - dtMs });
export const isOver = (s) => s.timeLeftMs <= 0;

/**
 * Apply an answer outcome: 'correct' | 'wrong' | 'skip'.
 * Returns { state, level, points, multiplier, bonusMs, penaltyMs, levelChange, milestone }.
 */
export function resolve(s, outcome) {
  const n = { ...s };
  const level = levelOf(s);
  const out = { level, points: 0, multiplier: multiplier(s.streak), bonusMs: 0, penaltyMs: 0, levelChange: 0, milestone: false };

  if (outcome === 'correct') {
    const c = applyCorrect(s.streak, basePoints(level));
    n.streak = c.streak;
    n.bestStreak = Math.max(s.bestStreak, c.streak);
    n.score += c.points;
    n.correct += 1;
    n.missRun = 0;
    n.timeLeftMs += c.bonusMs;
    out.points = c.points;
    out.bonusMs = c.bonusMs;
    out.milestone = c.milestone;
    if (s.mode !== 'daily') {
      n.runAtLevel = s.runAtLevel + 1;
      if (n.runAtLevel >= LEVEL_UP_RUN) {
        n.runAtLevel = 0;
        if (n.level < MAX_LEVEL) {
          n.level += 1;
          out.levelChange = 1;
        }
      }
    }
  } else {
    const penalty = outcome === 'skip' ? SKIP_PENALTY_MS : WRONG_PENALTY_MS;
    if (outcome === 'skip') n.skipped += 1;
    else n.wrong += 1;
    n.streak = 0;
    n.runAtLevel = 0;
    n.timeLeftMs = Math.max(0, s.timeLeftMs - penalty);
    out.penaltyMs = penalty;
    if (s.mode !== 'daily') {
      n.missRun = s.missRun + 1;
      if (n.missRun >= MISS_DROP_RUN) {
        n.missRun = 0;
        if (n.level > 1) {
          n.level -= 1;
          out.levelChange = -1;
        }
      }
    }
  }
  n.index += 1;
  n.maxLevel = Math.max(s.maxLevel, level, s.mode === 'daily' ? 0 : n.level);
  return { state: n, ...out };
}
