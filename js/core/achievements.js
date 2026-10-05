// Data-driven achievements. test(state, result) → boolean; `result` is null for non-game triggers.
import { ratingTier } from './benchmarks.js';
import { MASTERED_BOX } from './srs.js';

const masteredCount = (state) =>
  Object.values(state.srs).reduce((a, deck) => a + Object.values(deck).filter((c) => c.box >= MASTERED_BOX).length, 0);

export const ACHIEVEMENTS = [
  { id: 'first_rep', name: 'First Rep', desc: 'Finish any game.', test: (s) => s.counters.runs >= 1 },
  { id: 'streak_3', name: 'Three-Peat', desc: 'Reach a 3-day Daily streak.', test: (s) => s.daily.best >= 3 },
  { id: 'streak_7', name: 'Full Week', desc: 'Reach a 7-day Daily streak.', test: (s) => s.daily.best >= 7 },
  {
    id: 'qm_streak_20',
    name: 'Hot Hands',
    desc: 'Get 20 correct in a row in Quick Math.',
    test: (s, r) => r?.gameId === 'quickmath' && r.stats.bestStreak >= 20,
  },
  {
    id: 'qm_level_8',
    name: 'Top Gear',
    desc: 'Reach level 8 in a free Quick Math round.',
    test: (s, r) => r?.gameId === 'quickmath' && r.mode === 'free' && r.stats.maxLevel >= 8,
  },
  {
    id: 'calibrated',
    name: 'Well Calibrated',
    desc: 'Brier score under 0.10 over 8+ questions in How Sure Are You?',
    test: (s, r) => r?.gameId === 'sure' && r.stats.answered >= 8 && r.stats.brier < 0.1,
  },
  {
    id: 'stroop_95',
    name: 'Ink Control',
    desc: '95%+ accuracy over 40+ Stroop trials.',
    test: (s, r) => r?.gameId === 'stroop' && r.stats.trials >= 40 && r.stats.accuracy >= 0.95,
  },
  { id: 'vocab_50', name: 'Word Hoard', desc: 'Have 50 vocab items at box 4 or higher.', test: (s) => masteredCount(s) >= 50 },
  { id: 'dailies_10', name: 'Regular', desc: 'Complete 10 Daily Challenges.', test: (s) => s.daily.completed >= 10 },
  {
    id: 'elite_skill',
    name: 'Elite',
    desc: 'Reach the Elite tier in any skill.',
    test: (s) => Object.values(s.ratings).some((x) => ratingTier(x.r).name === 'Elite'),
  },
];

/** Ids newly satisfied (not already in state.achievements). Does not mutate. */
export function evaluate(state, result) {
  return ACHIEVEMENTS.filter((a) => !state.achievements[a.id] && a.test(state, result)).map((a) => a.id);
}

export const byId = (id) => ACHIEVEMENTS.find((a) => a.id === id);
