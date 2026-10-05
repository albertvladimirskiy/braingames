// Per-skill Elo-style ratings. Pure functions; persisted as { r, n } per skill.
import { RATING } from '../config.js';

export const expected = (R, d) => 1 / (1 + 10 ** ((d - R) / 400));
export const kFor = (n) => (n < RATING.earlyItems ? RATING.kEarly : RATING.kLate);
export const clampRating = (r) => Math.min(RATING.cap, Math.max(RATING.floor, r));
export const getRating = (ratings, skill) => ratings?.[skill] ?? { r: RATING.start, n: 0 };

/** Signal for an item: explicit graded `s`, else 1 / 0.75 / 0 by correctness and target time. */
export function itemSignal(item) {
  if (typeof item.s === 'number') return Math.min(1, Math.max(0, item.s));
  if (!item.correct) return 0;
  return item.targetMs != null && item.timeMs > item.targetMs ? 0.75 : 1;
}

/** One update. Returns a NEW { r, n }. `k` may override (calibration uses 40). */
export function updateRating(entry, { difficulty, s, k }) {
  const { r, n } = entry ?? { r: RATING.start, n: 0 };
  const next = r + (k ?? kFor(n)) * (s - expected(r, difficulty));
  return { r: clampRating(next), n: n + 1 };
}

/**
 * Apply a batch of GameResult items. Items flagged `noRating` are ignored (e.g. per-question
 * calibration rows; the session summary row carries the signal).
 * Returns { ratings (new object), deltas: { skill: { before, after, items } } }.
 */
export function applyItems(ratings, items) {
  const out = { ...ratings };
  const deltas = {};
  for (const item of items) {
    if (item.noRating || !item.skill || typeof item.difficulty !== 'number') continue;
    const before = getRating(out, item.skill);
    const after = updateRating(before, { difficulty: item.difficulty, s: itemSignal(item), k: item.k });
    out[item.skill] = after;
    const d = (deltas[item.skill] ??= { before: before.r, after: after.r, items: 0 });
    d.after = after.r;
    d.items++;
  }
  return { ratings: out, deltas };
}
