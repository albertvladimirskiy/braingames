// Ballpark: estimate parsing, log-error scoring, procedural question generation, question selection. Pure.
import { clamp } from '../../core/scoring.js';

export const SOFT_MS = 25000;
export const FREE_QUESTIONS = 8;
export const DAILY_QUESTIONS = 5;
export const MAX_POINTS = 135; // 100 accuracy + 25 within-10% bonus + 10 speed

const SUFFIX = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
const fail = (error) => ({ ok: false, error });
const HINT = 'Try 1200, 1,200, 3.5k, 2m, 1.2b, 5e6 or 1/4.';

/** Parse a typed estimate. Returns { ok: true, value } or { ok: false, error }. */
export function parseEstimate(input) {
  if (typeof input !== 'string') return fail(`Enter a number. ${HINT}`);
  const s = input.trim().toLowerCase().replace(/^\$/, '').replace(/\s+/g, '');
  if (!s) return fail(`Type your estimate. ${HINT}`);
  if (s.startsWith('-')) return fail('Estimates must be positive numbers.');

  let value;
  let m;
  if ((m = s.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/))) {
    if (Number(m[2]) === 0) return fail('Cannot divide by zero.');
    value = Number(m[1]) / Number(m[2]);
  } else if ((m = s.match(/^((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)([kmbt])?$/))) {
    value = Number(m[1].replace(/,/g, '')) * (m[2] ? SUFFIX[m[2]] : 1);
  } else if ((m = s.match(/^(\d+(?:\.\d+)?|\.\d+)e([+-]?\d+)$/))) {
    value = Number(`${m[1]}e${m[2]}`);
  } else {
    return fail(`I could not read “${input.trim()}”. ${HINT}`);
  }
  if (!Number.isFinite(value)) return fail('That number is too large.');
  if (value <= 0) return fail('Estimates must be above zero.');
  return { ok: true, value };
}

/** Score one answer against the truth. */
export function scoreAnswer({ estimate, truth, timeMs = SOFT_MS }) {
  const logRatio = Math.log10(estimate / truth);
  const err = Math.abs(logRatio);
  const base = Math.round(100 * Math.max(0, 1 - err / 1.5));
  const close = Math.abs(estimate - truth) / truth <= 0.1 + 1e-9 ? 25 : 0;
  const speed = base > 0 ? Math.round(10 * Math.max(0, 1 - timeMs / SOFT_MS)) : 0;
  return {
    err, logRatio, factor: 10 ** err,
    direction: err < 1e-9 ? 'exact' : logRatio > 0 ? 'high' : 'low',
    base, close, speed, points: base + close + speed,
    s: clamp(1 - err, 0, 1),
  };
}

/** "off by 3.2x (too high)" / "Spot on". */
export function describeMiss({ factor, direction, err }) {
  if (err < 0.02) return 'Spot on!';
  return `off by ${factor < 10 ? factor.toFixed(1) : Math.round(factor).toLocaleString('en-US')}x (too ${direction})`;
}

// ---- procedural numeric questions ---------------------------------------------------------

const gen = (id, difficulty, text, unit, truth, note) => ({ id: `gen:${id}`, text, unit, truth, tag: 'math', difficulty, note });

const GENERATORS = [
  (rng) => {
    const k = rng.int(12, 50);
    return gen(`pow:${k}`, 3, `What is 2^${k}?`, '', 2 ** k, `2^10 ≈ 1,000, so 2^${k} ≈ 10^${(k * 0.30103).toFixed(1)}.`);
  },
  (rng) => {
    const n = rng.int(8, 20);
    let f = 1;
    for (let i = 2; i <= n; i++) f *= i;
    return gen(`fact:${n}`, 4, `What is ${n}! (${n} factorial)?`, '', f, `${n}! = ${n} × ${n - 1} × … × 1.`);
  },
  (rng) => {
    const wide = rng.chance(0.5);
    const a = wide ? rng.int(120, 990) : rng.int(12, 99);
    const b = wide ? rng.int(120, 990) : rng.int(1200, 9900);
    return gen(`prod:${a}x${b}`, 2, `What is ${a.toLocaleString('en-US')} × ${b.toLocaleString('en-US')}?`, '', a * b, 'Round each number, multiply, then correct.');
  },
  (rng) => {
    const p = rng.pick([1000, 5000, 10000]);
    const r = rng.int(3, 12);
    const y = rng.int(10, 40);
    return gen(`compound:${p}:${r}:${y}`, 3, `$${p.toLocaleString('en-US')} grows at ${r}% a year, compounded annually, for ${y} years. Final value?`, '$', p * (1 + r / 100) ** y, `Rule of 72: it doubles roughly every ${Math.round(72 / r)} years.`);
  },
  (rng) => {
    const r = rng.pick([2, 3, 4, 5, 6, 8, 9, 10, 12]);
    return gen(`double:${r}`, 2, `At ${r}% growth a year (compounded), how many years until money doubles?`, 'years', Math.log(2) / Math.log(1 + r / 100), `The Rule of 72 gives 72 ÷ ${r} = ${(72 / r).toFixed(1)}.`);
  },
  (rng) => {
    const n = rng.int(3, 400);
    return gen(`secs:${n}`, 2, `How many seconds are there in ${n} days?`, 'seconds', n * 86400, `${n} × 86,400.`);
  },
];

export const generateNumeric = (rng) => rng.pick(GENERATORS)(rng);

/**
 * Pick `count` questions: ~60% from the curated bank (avoiding `exclude` ids where possible),
 * the rest procedural. Deterministic for a given rng.
 */
export function pickQuestions(rng, count, { bank, exclude = [] }) {
  const genCount = Math.round(count * 0.4);
  const bankCount = count - genCount;
  const skip = new Set(exclude);
  const fresh = bank.filter((q) => !skip.has(q.id));
  const pool = fresh.length >= bankCount ? fresh : bank;
  const picked = rng.shuffle(pool).slice(0, bankCount);
  const out = [...picked];
  const ids = new Set(out.map((q) => q.id));
  let guard = 0;
  while (out.length < count && guard++ < 200) {
    const g = generateNumeric(rng);
    if (!ids.has(g.id)) {
      ids.add(g.id);
      out.push(g);
    }
  }
  return rng.shuffle(out);
}

/** Aggregate answers for the end screen. */
export function summarize(answers) {
  const n = answers.length;
  const meanErr = n ? answers.reduce((a, x) => a + x.err, 0) / n : 0;
  return { n, meanErr, typicalFactor: 10 ** meanErr, points: answers.reduce((a, x) => a + x.points, 0) };
}

/** Position on the dot plot: log10(estimate / truth) clamped to ±3. */
export const plotX = (estimate, truth) => clamp(Math.log10(estimate / truth), -3, 3);
