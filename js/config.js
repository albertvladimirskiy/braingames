// Single source of app-wide constants. The product name lives ONLY here.
export const APP_NAME = 'Reps';
export const VERSION = '1.0.0';
export const STORAGE_KEY = 'reps:state';
export const SCHEMA_VERSION = 1;

export const CATEGORIES = {
  quant: { label: 'Quant', color: '#7F77DD' },
  language: { label: 'Language', color: '#1D9E75' },
  reasoning: { label: 'Reasoning', color: '#EF9F27' },
  reflex: { label: 'Reflex', color: '#D85A30' },
};

export const SKILLS = {
  mental_arithmetic: { label: 'Mental arithmetic', gameId: 'quickmath' },
  percentages: { label: 'Percentages', gameId: 'quickmath' },
  estimation: { label: 'Estimation', gameId: 'ballpark' },
  calibration: { label: 'Calibration', gameId: 'sure' },
  vocab_finance: { label: 'Finance vocab', gameId: 'wordbank', option: 'finance' },
  vocab_italian: { label: 'Italian vocab', gameId: 'wordbank', option: 'italian' },
  vocab_russian: { label: 'Russian vocab', gameId: 'wordbank', option: 'russian' },
  attention: { label: 'Attention', gameId: 'stroop' },
};

export const RATING = { start: 1000, floor: 400, cap: 2400, kEarly: 24, kLate: 12, earlyItems: 30 };

export const PLACEHOLDER_NOTE =
  'Tier and grade cutoffs are placeholders until calibrated with real play data.';

export const query = typeof location !== 'undefined'
  ? new URLSearchParams(location.search)
  : new URLSearchParams();
export const DEBUG = query.has('debug');
export const SEED_OVERRIDE = query.get('seed');
