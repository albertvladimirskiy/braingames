// How Sure Are You?: question selection and per-question / per-session scoring. Pure.
import { brier, brierPoints, meanBrier } from '../../core/calibration.js';
import { clamp } from '../../core/scoring.js';

export const FREE_QUESTIONS = 10;
export const DAILY_QUESTIONS = 6;
export const QUESTION_MS = 20000;
export const CONF_SNAPS = [50, 60, 70, 80, 90, 99];
export const RATING_DIFFICULTY = 1100;
export const RATING_K = 40;

/**
 * Pick `n` distinct statements, roughly half true / half false, preferring ones not in `exclude`.
 * Deterministic for a given rng.
 */
export function pickQuestions(rng, bank, n, exclude = []) {
  const skip = new Set(exclude);
  const take = (answer, count) => {
    const all = bank.filter((q) => q.answer === answer);
    const fresh = all.filter((q) => !skip.has(q.id));
    const stale = all.filter((q) => skip.has(q.id));
    return [...rng.shuffle(fresh), ...rng.shuffle(stale)].slice(0, count);
  };
  const extraTrue = rng.chance(0.5);
  const nTrue = Math.floor(n / 2) + (n % 2 ? (extraTrue ? 1 : 0) : 0);
  return rng.shuffle([...take(true, nTrue), ...take(false, n - nTrue)]);
}

/** Score one answered question. `confidence` is an integer percent 50–99 for the chosen answer. */
export function scoreQuestion({ chosen, truth, confidence }) {
  const q = confidence / 100;
  const correct = chosen === truth;
  return { q, correct, brier: brier(q, correct), points: brierPoints(q, correct) };
}

/** Rating signal for the whole session (applied once, K = 40, against difficulty 1100). */
export const ratingSignal = (sessionBrier) => clamp(1 - sessionBrier / 0.25, 0, 1);

/**
 * Build the GameResult pieces from the answered questions.
 * `answers`: [{ id, tag, chosen, truth, confidence, correct, points, timedOut }]
 */
export function summarizeSession(answers) {
  const answered = answers.filter((a) => !a.timedOut);
  const samples = answered.map((a) => ({ q: a.confidence / 100, correct: a.correct }));
  const sessionBrier = meanBrier(samples);
  const items = answered.map((a) => ({ skill: 'calibration', difficulty: RATING_DIFFICULTY, correct: a.correct, noRating: true, timeMs: a.timeMs }));
  if (answered.length) {
    items.push({ skill: 'calibration', difficulty: RATING_DIFFICULTY, s: ratingSignal(sessionBrier), k: RATING_K, summary: true });
  }
  return {
    answered: answered.length,
    brier: sessionBrier,
    score: answers.reduce((a, x) => a + x.points, 0),
    samples,
    items,
    correct: answered.filter((a) => a.correct).length,
  };
}
