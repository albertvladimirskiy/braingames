// Daily Challenge: same content for everyone (UTC date seed), first attempt counts, streaks + freezes.
import { APP_NAME } from '../config.js';
import { clamp } from './scoring.js';

export const SEGMENTS = [
  { gameId: 'quickmath', label: 'Math', durationSec: 45 },
  { gameId: 'ballpark', label: 'Ballpark', questions: 5 },
  { gameId: 'sure', label: 'Sure', questions: 6 },
];

// Score that earns a full 333 for each segment.
// PLACEHOLDER: calibrate from real play data
export const SEGMENT_MAX = { quickmath: 600, ballpark: 675, sure: 600 };
export const SEGMENT_POINTS = 333;
export const MAX_FREEZES = 2;
export const FREEZE_EVERY = 7;

const DAY = 86400000;
const toMs = (d) => Date.parse(`${d}T00:00:00Z`);

export const utcDate = (ms) => new Date(ms).toISOString().slice(0, 10);
export const dailySeed = (date, gameId) => `daily:${date}:${gameId}`;
export const daysBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY);
export const addDays = (d, n) => utcDate(toMs(d) + n * DAY);

export function normalizeSegment(gameId, score) {
  return clamp(Math.round((score / SEGMENT_MAX[gameId]) * SEGMENT_POINTS), 0, SEGMENT_POINTS);
}

/** ms until the next UTC midnight, and that instant as epoch ms (format it in local time in the view). */
export function nextReset(nowMs) {
  const at = toMs(utcDate(nowMs)) + DAY;
  return { ms: at - nowMs, at };
}

export const emptyDaily = () => ({ results: {}, streak: 0, best: 0, lastDate: null, freezes: 0, completed: 0, progress: null });

/** Streak as the player should see it today (alive if freezes can cover every missed day). */
export function liveStreak(daily, today) {
  if (!daily.lastDate) return 0;
  const gap = daysBetween(daily.lastDate, today);
  if (gap <= 1) return daily.streak;
  return daily.freezes >= gap - 1 ? daily.streak : 0;
}

/**
 * Record a finished daily. `scores` = normalized per-segment scores. Only the first completion of a
 * UTC date counts. Returns { daily (new), counted, total, streak, frozen, earnedFreeze }.
 */
export function recordDaily(daily, date, scores) {
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  if (daily.results[date]) {
    return { daily, counted: false, total, streak: daily.streak, frozen: 0, earnedFreeze: false };
  }
  const next = { ...daily, results: { ...daily.results, [date]: { scores, total } }, completed: daily.completed + 1, progress: null };
  let frozen = 0;
  let advanced = false;
  if (!daily.lastDate) {
    next.streak = 1;
    advanced = true;
  } else {
    const gap = daysBetween(daily.lastDate, date);
    if (gap === 1) {
      next.streak = daily.streak + 1;
      advanced = true;
    } else if (gap > 1) {
      const missed = gap - 1;
      if (daily.freezes >= missed) {
        next.freezes = daily.freezes - missed;
        frozen = missed;
        next.streak = daily.streak + 1;
      } else next.streak = 1;
      advanced = true;
    } // gap <= 0 (clock moved back): count the day but leave the streak alone
  }
  if (advanced) next.lastDate = date;
  next.best = Math.max(daily.best, next.streak);
  let earnedFreeze = false;
  if (advanced && next.streak > 0 && next.streak % FREEZE_EVERY === 0 && next.freezes < MAX_FREEZES) {
    next.freezes += 1;
    earnedFreeze = true;
  }
  return { daily: next, counted: true, total, streak: next.streak, frozen, earnedFreeze };
}

export function shareText({ date, scores, total, streak }) {
  return [
    `${APP_NAME} Daily ${date}`,
    `Math ${scores.quickmath ?? 0} | Ballpark ${scores.ballpark ?? 0} | Sure ${scores.sure ?? 0}`,
    `Total ${total} | Streak ${streak}`,
  ].join('\n');
}
