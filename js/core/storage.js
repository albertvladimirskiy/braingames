// Storage adapter: versioned schema + migrations over a tiny sync backend interface
// { getItem(key), setItem(key, str), removeItem(key) }. A remote backend can wrap the
// same interface (see docs/BACKEND_PLAN.md).
import { SCHEMA_VERSION, STORAGE_KEY, APP_NAME } from '../config.js';

export function defaultState() {
  return {
    v: SCHEMA_VERSION,
    settings: { sound: true, haptics: true, theme: 'system', motion: 'system' },
    ratings: {}, // skillId -> { r, n }
    xp: 0,
    history: [], // { gameId, mode, score, at, xp }
    bests: {}, // gameId -> { score, at }
    counters: { runs: 0 },
    srs: {}, // deckId -> { cardId -> { box, due, lapses, seen } }
    calibration: { buckets: Array.from({ length: 5 }, () => ({ n: 0, hits: 0, sumQ: 0 })) },
    seen: {}, // gameId -> [recently seen content ids]
    daily: { results: {}, streak: 0, best: 0, lastDate: null, freezes: 0, completed: 0, progress: null },
    achievements: {}, // id -> unlockedAt
    prefs: {}, // gameId -> last setup choice
    flags: { welcomed: false },
  };
}

/** MIGRATIONS[i] upgrades a v(i) state to v(i+1). */
export const MIGRATIONS = [
  // v0 → v1: ratings were bare numbers, bests lived under `best` as bare scores.
  (s) => {
    const ratings = {};
    for (const [k, val] of Object.entries(s.ratings ?? {})) {
      ratings[k] = typeof val === 'number' ? { r: val, n: 0 } : val;
    }
    const bests = { ...(s.bests ?? {}) };
    for (const [k, val] of Object.entries(s.best ?? {})) bests[k] = { score: val, at: 0 };
    const { best, ...rest } = s;
    return { ...rest, ratings, bests };
  },
];

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** Fill any missing keys from defaults (recursively for plain objects). */
export function withDefaults(value, defaults) {
  if (!isObj(defaults)) return value === undefined ? defaults : value;
  const out = { ...(isObj(value) ? value : {}) };
  for (const [k, d] of Object.entries(defaults)) {
    out[k] = isObj(d) ? withDefaults(out[k], d) : out[k] === undefined ? d : out[k];
  }
  return out;
}

/** Bring any raw saved object up to the current schema. Throws if from a newer version. */
export function migrate(raw) {
  if (!isObj(raw)) throw new Error('State is not an object');
  let s = { ...raw };
  let v = Number.isInteger(s.v) ? s.v : 0;
  if (v > SCHEMA_VERSION) throw new Error(`Save is from a newer version (v${v})`);
  while (v < SCHEMA_VERSION) {
    s = MIGRATIONS[v](s);
    v++;
    s.v = v;
  }
  return withDefaults(s, defaultState());
}

export function memoryBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

export function defaultBackend() {
  try {
    const ls = globalThis.localStorage;
    ls.setItem('__reps_probe', '1');
    ls.removeItem('__reps_probe');
    return ls;
  } catch {
    return memoryBackend(); // private mode / blocked storage: play works, nothing persists
  }
}

export function createStorage(backend = defaultBackend(), key = STORAGE_KEY) {
  const subs = new Set();
  let state = load();

  function load() {
    try {
      const raw = backend.getItem(key);
      return raw ? migrate(JSON.parse(raw)) : defaultState();
    } catch {
      return defaultState();
    }
  }
  function save() {
    try {
      backend.setItem(key, JSON.stringify(state));
      return true;
    } catch {
      return false; // quota/blocked: keep playing from memory
    }
  }
  function notify() {
    for (const fn of subs) fn(state);
  }

  return {
    get: () => state,
    /** Mutate state inside fn, then persist and notify. */
    update(fn) {
      fn(state);
      save();
      notify();
    },
    save,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    exportJson() {
      return JSON.stringify(
        { app: APP_NAME.toLowerCase(), exportedAt: new Date().toISOString(), state },
        null,
        2,
      );
    },
    /** Replace state from an export (or a bare state object). Throws on invalid input. */
    importJson(text) {
      const data = JSON.parse(text);
      const incoming = isObj(data) && isObj(data.state) ? data.state : data;
      state = migrate(incoming);
      save();
      notify();
    },
    reset() {
      state = defaultState();
      backend.removeItem(key);
      save();
      notify();
    },
  };
}
