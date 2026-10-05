import { PLACEHOLDER_NOTE } from '../config.js';

// Two benchmark layers. EVERY cutoff in the app lives in this file.
// The UI states they are placeholders (see PLACEHOLDER_NOTE in config.js).

// Layer 1: rating tiers.
export const TIERS = [
  { name: 'Rookie', min: 0 }, // PLACEHOLDER: calibrate from real play data
  { name: 'Solid', min: 900 }, // PLACEHOLDER: calibrate from real play data
  { name: 'Sharp', min: 1100 }, // PLACEHOLDER: calibrate from real play data
  { name: 'Elite', min: 1300 }, // PLACEHOLDER: calibrate from real play data
];

// Layer 2: per-game session score cutoffs [Solid, Sharp, Elite].
export const GAME_GRADES = {
  quickmath: [200, 400, 700], // PLACEHOLDER: calibrate from real play data
  ballpark: [300, 520, 760], // PLACEHOLDER: calibrate from real play data
  sure: [80, 250, 420], // PLACEHOLDER: calibrate from real play data
  wordbank: [120, 260, 450], // PLACEHOLDER: calibrate from real play data
  stroop: [150, 320, 520], // PLACEHOLDER: calibrate from real play data
  oddscheck: [60, 200, 380], // PLACEHOLDER: calibrate from real play data
};

function tierFrom(levels, value) {
  let idx = 0;
  levels.forEach((l, i) => {
    if (value >= l.min) idx = i;
  });
  const next = levels[idx + 1] ?? null;
  return { name: levels[idx].name, index: idx, next: next && next.name, toNext: next ? Math.ceil(next.min - value) : 0 };
}

/** { name, index, next: name|null, toNext: points } for a skill rating. */
export const ratingTier = (r) => tierFrom(TIERS, r);

/** Same shape for a session score; null when the game has no grade table. */
export function gradeOf(gameId, score) {
  const cut = GAME_GRADES[gameId];
  if (!cut) return null;
  const levels = [{ name: TIERS[0].name, min: -Infinity }, ...cut.map((min, i) => ({ name: TIERS[i + 1].name, min }))];
  return tierFrom(levels, score);
}

export const DAY_MS = 86400000;

/**
 * Compare a run against the player's own history ("ghost"): last run, personal best, 7-day average.
 * Only free-mode runs of this game count. Call BEFORE adding the new run to history.
 */
export function compareToHistory(history, gameId, score, nowMs) {
  const runs = history.filter((h) => h.gameId === gameId && h.mode === 'free');
  const last = runs.length ? runs[runs.length - 1].score : null;
  const pb = runs.length ? Math.max(...runs.map((r) => r.score)) : null;
  const recent = runs.filter((r) => r.at >= nowMs - 7 * DAY_MS);
  const avg7 = recent.length ? recent.reduce((a, r) => a + r.score, 0) / recent.length : null;
  return {
    runs: runs.length,
    last,
    pb,
    avg7,
    deltaLast: last == null ? null : score - last,
    deltaPb: pb == null ? null : score - pb,
    deltaAvg: avg7 == null ? null : score - avg7,
    isPb: pb != null && score > pb,
  };
}

// ---- optional server calibration ----------------------------------------------------------------
// When the player is connected to a server that has enough data (GET /v1/benchmarks), its percentile-based
// cutoffs replace the placeholders above for the games/tiers it covers. Offline play keeps the last result.
let calibration = null;
const validCuts = (c) => Array.isArray(c) && c.length === 3 && c.every(Number.isFinite) && c[0] < c[1] && c[1] < c[2];

export function applyCalibration(b) {
  if (!b || b.source !== 'calibrated') return false;
  let used = false;
  for (const [id, cuts] of Object.entries(b.games ?? {})) {
    if (GAME_GRADES[id] && validCuts(cuts)) {
      GAME_GRADES[id] = cuts;
      used = true;
    }
  }
  if (validCuts(b.rating)) {
    b.rating.forEach((min, i) => (TIERS[i + 1].min = min));
    used = true;
  }
  if (used) calibration = { devices: b.sample?.devices ?? 0, games: Object.keys(b.games ?? {}), rating: validCuts(b.rating) };
  return used;
}

export const calibrationInfo = () => calibration;

/** The honest label for the benchmark numbers currently in use. */
export function benchmarkNote() {
  if (!calibration) return PLACEHOLDER_NOTE;
  const covered = calibration.games.length;
  return `Cutoffs for ${covered} game${covered === 1 ? '' : 's'}${calibration.rating ? ' and the rating tiers' : ''} are calibrated from ${calibration.devices} players’ runs. Anything not covered is still a placeholder.`;
}
