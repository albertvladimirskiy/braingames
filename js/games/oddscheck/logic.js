// Odds Check (stretch game): base-rate problems phrased as natural frequencies. Pure.
// Answers are exact whole percents so multiple choice never hinges on rounding.

export const QUESTIONS = 6;
export const QUESTION_MS = 25000;
export const BASE_POINTS = 60;
export const SPEED_POINTS = 40;
export const RATING_DIFFICULTY = 1100;
export const RATING_K = 40;

const POPULATIONS = [1000, 1000, 1000, 500, 2000];
const KS = [5, 10, 20, 25, 40, 50, 100];
const SENS = [0.6, 0.7, 0.75, 0.8, 0.9, 0.95, 1];

const SCENARIOS = [
  { n: 'people', has: 'have the condition', pos: 'A screening test catches', fpv: 'and also falsely flags', rest: 'healthy people', picked: 'A person is picked at random and tests positive.', ask: 'chance that they really have the condition', flagged: 'test positive' },
  { n: 'parts', has: 'are defective', pos: 'An inspection machine rejects', fpv: 'and also wrongly rejects', rest: 'good parts', picked: 'A part is picked at random and was rejected.', ask: 'chance that it is really defective', flagged: 'get rejected' },
  { n: 'emails', has: 'are phishing attempts', pos: 'A spam filter flags', fpv: 'and also wrongly flags', rest: 'legitimate emails', picked: 'An email is picked at random and was flagged.', ask: 'chance that it really is phishing', flagged: 'get flagged' },
  { n: 'transactions', has: 'are fraudulent', pos: 'A fraud alarm triggers on', fpv: 'and also triggers on', rest: 'genuine transactions', picked: 'A transaction is picked at random and the alarm went off.', ask: 'chance that it really is fraudulent', flagged: 'set off the alarm' },
];

/** Every (population, base rate, sensitivity, false positives) with an exact whole-percent answer that is well below the sensitivity. */
const SHAPES = (() => {
  const out = [];
  for (const n of new Set(POPULATIONS)) {
    for (const k of KS) {
      for (const s of SENS) {
        const tp = k * s;
        if (!Number.isInteger(tp) || tp < 1) continue;
        for (let fp = 1; fp <= n - k; fp++) {
          if ((tp * 100) % (tp + fp) !== 0) continue;
          const pct = (tp * 100) / (tp + fp);
          if (pct >= 4 && pct <= 0.75 * s * 100) out.push({ n, k, tp, fp, pct });
        }
      }
    }
  }
  return out;
})();

const fmt = (x) => x.toLocaleString('en-US');

export function buildProblem(rng) {
  const shape = rng.pick(SHAPES);
  const sc = rng.pick(SCENARIOS);
  const rest = shape.n - shape.k;
  const fn = shape.k - shape.tp;
  const tn = rest - shape.fp;
  return {
    ...shape, rest, fn, tn, scenario: sc,
    text: `Out of ${fmt(shape.n)} ${sc.n}, ${fmt(shape.k)} ${sc.has}. ${sc.pos} ${fmt(shape.tp)} of those ${fmt(shape.k)}, ${sc.fpv} ${fmt(shape.fp)} of the other ${fmt(rest)} ${sc.rest}. ${sc.picked} What is the ${sc.ask}?`,
    explanation: `Picture ${fmt(shape.n)} ${sc.n}. ${fmt(shape.tp)} of the ${fmt(shape.k)} real cases ${sc.flagged}, and so do ${fmt(shape.fp)} of the other ${fmt(rest)}. That is ${fmt(shape.tp + shape.fp)} in total, and only ${fmt(shape.tp)} are real: ${fmt(shape.tp)} ÷ ${fmt(shape.tp + shape.fp)} = ${shape.pct}%.`,
  };
}

/** Four distinct whole-percent options: the answer plus the classic mistakes (sensitivity, specificity, base rate). */
export function buildOptions(problem, rng) {
  const sens = Math.round((problem.tp / problem.k) * 100);
  const spec = Math.round((problem.tn / problem.rest) * 100);
  const base = Math.max(1, Math.round((problem.k / problem.n) * 100));
  const taken = new Set([problem.pct]);
  const distractors = [];
  for (const v of [sens, spec, base * 5, Math.min(95, problem.pct * 2), Math.round(problem.pct / 2), sens - 10]) {
    if (distractors.length === 3) break;
    if (v >= 1 && v <= 99 && !taken.has(v) && ![...taken].some((t) => Math.abs(t - v) < 3)) {
      taken.add(v);
      distractors.push(v);
    }
  }
  while (distractors.length < 3) {
    const v = rng.int(2, 98);
    if (![...taken].some((t) => Math.abs(t - v) < 4)) {
      taken.add(v);
      distractors.push(v);
    }
  }
  const options = rng.shuffle([problem.pct, ...distractors]);
  return { options, correctIndex: options.indexOf(problem.pct), sens, spec };
}

export const pointsFor = (correct, timeMs) => (correct ? BASE_POINTS + Math.round(SPEED_POINTS * Math.max(0, 1 - timeMs / QUESTION_MS)) : 0);

/** One rated item per session (like calibration): s = share correct, K = 40, d = 1100. */
export function sessionItems(results) {
  if (!results.length) return [];
  const s = results.filter((r) => r.correct).length / results.length;
  return [{ skill: 'calibration', difficulty: RATING_DIFFICULTY, s, k: RATING_K, summary: true }];
}
