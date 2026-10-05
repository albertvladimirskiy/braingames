// Merge two storage states (this device + the server copy) without losing progress. Pure.
// Rules (see docs/BACKEND_PLAN.md): more rated items wins per skill, best score wins, histories are unioned,
// per-card SRS keeps the more-reviewed card, achievements keep the earlier unlock, device settings stay local.
import { sanitize } from './storage.js';

const HISTORY_CAP = 300;
const SEEN_CAP = 80;
const pickBy = (cur, next, better) => (better(cur, next) ? next : cur); // keep cur unless better(cur, next) says next wins

function mergeMaps(a, b, better) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in out ? pickBy(out[k], v, better) : v;
  return out;
}

export function mergeStates(local, remote) {
  const l = sanitize(local);
  const r = sanitize(remote);

  const history = [...l.history, ...r.history].filter((h, i, all) => all.findIndex((x) => x.gameId === h.gameId && x.at === h.at && x.score === h.score) === i);
  history.sort((x, y) => x.at - y.at);

  const srs = {};
  for (const id of new Set([...Object.keys(l.srs), ...Object.keys(r.srs)])) {
    srs[id] = mergeMaps(l.srs[id] ?? {}, r.srs[id] ?? {}, (cur, next) => next.seen > cur.seen || (next.seen === cur.seen && next.due > cur.due));
  }

  const dailyWinner = r.daily.lastDate && (!l.daily.lastDate || r.daily.lastDate > l.daily.lastDate || (r.daily.lastDate === l.daily.lastDate && r.daily.streak > l.daily.streak)) ? r.daily : l.daily;
  const results = mergeMaps(l.daily.results, r.daily.results, () => false); // same date: keep ours (first attempt counted on both)
  const seen = {};
  for (const id of new Set([...Object.keys(l.seen), ...Object.keys(r.seen)])) seen[id] = [...new Set([...(l.seen[id] ?? []), ...(r.seen[id] ?? [])])].slice(-SEEN_CAP);

  return {
    ...l,
    xp: Math.max(l.xp, r.xp),
    ratings: mergeMaps(l.ratings, r.ratings, (cur, next) => next.n > cur.n),
    history: history.slice(-HISTORY_CAP),
    bests: mergeMaps(l.bests, r.bests, (cur, next) => next.score > cur.score),
    counters: { runs: Math.max(l.counters.runs, r.counters.runs) },
    srs,
    calibration: { buckets: l.calibration.buckets.map((b, i) => (r.calibration.buckets[i].n > b.n ? r.calibration.buckets[i] : b)) },
    seen,
    daily: {
      results,
      streak: dailyWinner.streak,
      lastDate: dailyWinner.lastDate,
      freezes: dailyWinner.freezes,
      best: Math.max(l.daily.best, r.daily.best, dailyWinner.streak),
      completed: Math.max(l.daily.completed, r.daily.completed, Object.keys(results).length),
      progress: l.daily.progress,
    },
    achievements: mergeMaps(l.achievements, r.achievements, (cur, next) => next < cur),
    prefs: { ...r.prefs, ...l.prefs },
    flags: { welcomed: l.flags.welcomed || r.flags.welcomed },
    // settings (incl. sync credentials) are per-device and never merged
  };
}
