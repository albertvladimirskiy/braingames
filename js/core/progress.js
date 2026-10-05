// finalizeRun: the one place a finished GameResult becomes rating / PB / XP / history / achievements.
// Pure with respect to the DOM; mutates the storage state draft it is given.
import { applyItems } from './rating.js';
import { compareToHistory, gradeOf, ratingTier } from './benchmarks.js';
import { levelInfo, xpForScore } from './scoring.js';
import { addSamples } from './calibration.js';
import { evaluate, byId } from './achievements.js';

const HISTORY_CAP = 300;
const SEEN_CAP = 80;

export function runAchievements(state, result, now) {
  const ids = evaluate(state, result);
  for (const id of ids) state.achievements[id] = now;
  return ids.map(byId);
}

/**
 * @param state mutable storage state
 * @param result GameResult { gameId, mode, score, durationMs, items, stats }
 * @param opts { practice, now }  practice = Daily replay: nothing is written.
 */
export function finalizeRun(state, result, { practice = false, now = Date.now() } = {}) {
  if (practice) return { practice: true, ratingDeltas: {}, tierChanges: [], newAchievements: [], xpGain: 0 };
  const free = result.mode === 'free';

  const compare = free ? compareToHistory(state.history, result.gameId, result.score, now) : null;
  const grade = free ? gradeOf(result.gameId, result.score) : null;

  const { ratings, deltas } = applyItems(state.ratings, result.items);
  const tierChanges = [];
  for (const [skill, d] of Object.entries(deltas)) {
    const a = ratingTier(d.before).name, b = ratingTier(d.after).name;
    if (a !== b) tierChanges.push({ skill, from: a, to: b });
  }
  state.ratings = ratings;

  const levelBefore = levelInfo(state.xp).level;
  const xpGain = xpForScore(result.score);
  state.xp += xpGain;
  const levelAfter = levelInfo(state.xp).level;

  state.history.push({ gameId: result.gameId, mode: result.mode, score: result.score, at: now, xp: xpGain });
  if (state.history.length > HISTORY_CAP) state.history.splice(0, state.history.length - HISTORY_CAP);

  if (free && (!state.bests[result.gameId] || result.score > state.bests[result.gameId].score)) {
    state.bests[result.gameId] = { score: result.score, at: now };
  }
  state.counters.runs += 1;

  const ids = result.stats?.seenIds;
  if (ids?.length) state.seen[result.gameId] = [...(state.seen[result.gameId] ?? []), ...ids].slice(-SEEN_CAP);
  const samples = result.stats?.calibration;
  if (samples?.length) state.calibration.buckets = addSamples(state.calibration.buckets, samples);

  const newAchievements = runAchievements(state, result, now);
  return {
    practice: false,
    compare,
    grade,
    isPb: !!compare?.isPb,
    ratingDeltas: deltas,
    tierChanges,
    xpGain,
    level: { before: levelBefore, after: levelAfter, ...levelInfo(state.xp) },
    newAchievements,
  };
}
