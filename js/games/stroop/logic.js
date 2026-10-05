// Stroop: trial generation (congruence ramp + rule flips) and scoring. Pure.
import { applyCorrect } from '../../core/scoring.js';

export const COLORS = [
  { id: 'red', name: 'RED', key: 'r' },
  { id: 'blue', name: 'BLUE', key: 'b' },
  { id: 'green', name: 'GREEN', key: 'g' },
  { id: 'yellow', name: 'YELLOW', key: 'y' },
];
export const DURATION_MS = 45000;
export const WRONG_PENALTY_MS = 2000;
export const FAST_MS = 600;
export const BASE_POINTS = 10;
export const FAST_BONUS = 5;
export const FLIP_EVERY = [9, 11]; // a rule flip roughly every 10 trials
export const BANNER_MS = 1100;

// d: congruent 900, incongruent 1100, rule-flip trial 1300; target times 900 / 1100 / 1400 ms
export const DIFFICULTY = { congruent: 900, incongruent: 1100, flip: 1300 };
export const TARGET_MS = { congruent: 900, incongruent: 1100, flip: 1400 };

/** Share of incongruent trials ramps from 15% to 80% over the round. */
export const pIncongruent = (progress) => 0.15 + 0.65 * Math.min(1, Math.max(0, progress));

export function initState(rng, { durationMs = DURATION_MS } = {}) {
  return {
    rule: 'ink', index: 0, nextFlipAt: rng.int(...FLIP_EVERY), streak: 0, bestStreak: 0,
    timeLeftMs: durationMs, durationMs, score: 0, correct: 0, wrong: 0,
    rts: { congruent: [], incongruent: [] },
  };
}

/**
 * Next trial. If it is a flip point the rule toggles first and the trial is marked kind:'flip'
 * (the first trial under the new rule). Returns { state, trial }.
 */
export function nextTrial(s, rng) {
  const n = { ...s, index: s.index + 1 };
  let flipped = false;
  if (s.index === s.nextFlipAt) {
    n.rule = s.rule === 'ink' ? 'word' : 'ink';
    n.nextFlipAt = s.nextFlipAt + rng.int(...FLIP_EVERY);
    flipped = true;
  }
  const progress = 1 - s.timeLeftMs / s.durationMs;
  const congruent = !rng.chance(pIncongruent(progress));
  const word = rng.pick(COLORS);
  const ink = congruent ? word : rng.pick(COLORS.filter((c) => c.id !== word.id));
  const kind = flipped ? 'flip' : congruent ? 'congruent' : 'incongruent';
  return { state: n, trial: { word: word.id, ink: ink.id, rule: n.rule, congruent, kind, answer: n.rule === 'ink' ? ink.id : word.id } };
}

export const tick = (s, dtMs) => ({ ...s, timeLeftMs: s.timeLeftMs - dtMs });
export const isOver = (s) => s.timeLeftMs <= 0;

/** Apply a tap. Returns { state, correct, points, multiplier, penaltyMs, milestone, item }. */
export function answer(s, trial, choiceId, rtMs) {
  const correct = choiceId === trial.answer;
  const n = { ...s, rts: { congruent: s.rts.congruent, incongruent: s.rts.incongruent } };
  const out = { correct, points: 0, multiplier: 1, penaltyMs: 0, milestone: false };
  if (correct) {
    const c = applyCorrect(s.streak, BASE_POINTS + (rtMs < FAST_MS ? FAST_BONUS : 0));
    n.streak = c.streak;
    n.bestStreak = Math.max(s.bestStreak, c.streak);
    n.score += c.points;
    n.correct += 1;
    n.rts[trial.congruent ? 'congruent' : 'incongruent'] = [...n.rts[trial.congruent ? 'congruent' : 'incongruent'], rtMs];
    Object.assign(out, { points: c.points, multiplier: c.multiplier, milestone: c.milestone });
  } else {
    n.streak = 0;
    n.wrong += 1;
    n.timeLeftMs = Math.max(0, s.timeLeftMs - WRONG_PENALTY_MS);
    out.penaltyMs = WRONG_PENALTY_MS;
  }
  const item = { skill: 'attention', difficulty: DIFFICULTY[trial.kind], correct, timeMs: rtMs, targetMs: TARGET_MS[trial.kind], kind: trial.kind };
  return { state: n, ...out, item };
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export function summarize(s) {
  const trials = s.correct + s.wrong;
  const congruent = mean(s.rts.congruent);
  const incongruent = mean(s.rts.incongruent);
  return {
    trials,
    accuracy: trials ? s.correct / trials : 0,
    meanCongruentMs: congruent,
    meanIncongruentMs: incongruent,
    stroopCostMs: congruent != null && incongruent != null ? incongruent - congruent : null,
    bestStreak: s.bestStreak,
  };
}
