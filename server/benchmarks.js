// Calibrates benchmark cutoffs from real play data (uploaded states or exported backups). Pure.
import { GAME_GRADES } from '../js/core/benchmarks.js';

export const MIN_RUNS = 30; // per game
export const MIN_DEVICES = 5;
export const GAME_PERCENTILES = [0.4, 0.7, 0.9]; // Solid / Sharp / Elite
export const RATING_PERCENTILES = [0.3, 0.65, 0.9];
export const MIN_RATED_ITEMS = 30;

/** Linear-interpolated percentile of a numeric array (p in 0..1). */
export function percentile(values, p) {
  if (!values.length) return NaN;
  const a = [...values].sort((x, y) => x - y);
  const i = (a.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}

/** Force strictly increasing integer cutoffs. */
const increasing = (cuts) => cuts.reduce((out, c) => [...out, Math.max(Math.round(c), (out.at(-1) ?? 0) + 1)], []);

/** states: array of storage states (one per device). */
export function computeBenchmarks(states) {
  const games = {};
  const sample = { devices: states.length, runs: {} };
  for (const gameId of Object.keys(GAME_GRADES)) {
    const scores = [];
    let devices = 0;
    for (const s of states) {
      const mine = (s.history ?? []).filter((h) => h.gameId === gameId && h.mode === 'free').map((h) => h.score);
      if (mine.length) devices++;
      scores.push(...mine);
    }
    sample.runs[gameId] = scores.length;
    if (scores.length >= MIN_RUNS && devices >= MIN_DEVICES) games[gameId] = increasing(GAME_PERCENTILES.map((p) => Math.max(1, percentile(scores, p))));
  }
  const ratings = [];
  let rd = 0;
  for (const s of states) {
    const mine = Object.values(s.ratings ?? {}).filter((r) => r.n >= MIN_RATED_ITEMS).map((r) => r.r);
    if (mine.length) rd++;
    ratings.push(...mine);
  }
  sample.ratings = ratings.length;
  const rating = ratings.length >= 20 && rd >= MIN_DEVICES ? increasing(RATING_PERCENTILES.map((p) => percentile(ratings, p))) : null;
  return { source: Object.keys(games).length || rating ? 'calibrated' : 'placeholder', games, rating, sample };
}
