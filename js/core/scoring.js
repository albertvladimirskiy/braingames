// Shared streak / multiplier / XP rules.

/** multiplier = 1 + min(3, floor(streak/5)), using the streak BEFORE incrementing. */
export const multiplier = (streak) => 1 + Math.min(3, Math.floor(streak / 5));

export const STREAK_TIME_BONUS_MS = 2000;

/**
 * Score a correct answer. `streak` is the streak before this answer.
 * Every 5th consecutive correct answer (after incrementing) earns +2s.
 */
export function applyCorrect(streak, basePoints) {
  const mult = multiplier(streak);
  const next = streak + 1;
  const milestone = next % 5 === 0;
  return {
    points: basePoints * mult,
    multiplier: mult,
    streak: next,
    milestone,
    bonusMs: milestone ? STREAK_TIME_BONUS_MS : 0,
  };
}

/** Score-based XP: a little for showing up, plus score/10. */
export const xpForScore = (score) => 5 + Math.max(0, Math.round(score / 10));

/** Reps level from lifetime XP: level L starts at 50·(L−1)² XP. */
export function levelInfo(xp) {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
  const floorXp = 50 * (level - 1) ** 2;
  const nextXp = 50 * level ** 2;
  return { level, xp, into: xp - floorXp, needed: nextXp - floorXp, nextXp };
}

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
