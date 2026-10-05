// Storage adapter: versioned schema + migrations over a tiny sync backend interface
// { getItem(key), setItem(key, str), removeItem(key) }. A remote backend can wrap the
// same interface (see docs/BACKEND_PLAN.md).
import { SCHEMA_VERSION, STORAGE_KEY, APP_NAME } from '../config.js';

export function defaultState() {
  return {
    v: SCHEMA_VERSION,
    rev: 0, // bumped on every save; lets a second tab notice it is behind
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
    const { best: _old, ...rest } = s;
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

const num = (x, min = -Infinity) => typeof x === 'number' && Number.isFinite(x) && x >= min;
const isDate = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
const mapValues = (obj, keep) => Object.fromEntries(Object.entries(isObj(obj) ? obj : {}).filter(([, v]) => keep(v)));

/**
 * Coerce a (possibly corrupted or hand-edited) state into something the app can safely use:
 * wrong-typed fields fall back to defaults and malformed records are dropped. Never throws.
 */
export function sanitize(state) {
  const d = defaultState();
  const s = { ...state };
  for (const [k, def] of Object.entries(d)) {
    if (Array.isArray(def) !== Array.isArray(s[k]) || (isObj(def) && !isObj(s[k])) || typeof def !== typeof s[k]) s[k] = def;
  }
  if (!num(s.xp, 0)) s.xp = 0;
  if (!Number.isInteger(s.rev) || s.rev < 0) s.rev = 0;
  const st = s.settings;
  s.settings = {
    sound: typeof st.sound === 'boolean' ? st.sound : true,
    haptics: typeof st.haptics === 'boolean' ? st.haptics : true,
    theme: ['system', 'dark', 'light'].includes(st.theme) ? st.theme : 'system',
    motion: ['system', 'reduce', 'full'].includes(st.motion) ? st.motion : 'system',
  };
  s.ratings = mapValues(s.ratings, (v) => isObj(v) && num(v.r) && num(v.n, 0));
  s.history = s.history.filter((h) => isObj(h) && typeof h.gameId === 'string' && num(h.score) && num(h.at));
  s.bests = mapValues(s.bests, (v) => isObj(v) && num(v.score));
  s.counters = { runs: num(s.counters.runs, 0) ? s.counters.runs : 0 };
  s.srs = Object.fromEntries(
    Object.entries(s.srs).filter(([, deck]) => isObj(deck)).map(([id, deck]) => [
      id,
      mapValues(deck, (c) => isObj(c) && Number.isInteger(c.box) && c.box >= 1 && c.box <= 5 && num(c.due) && num(c.lapses, 0) && num(c.seen, 0)),
    ]),
  );
  const b = s.calibration.buckets;
  const okBuckets = Array.isArray(b) && b.length === 5 && b.every((x) => isObj(x) && num(x.n, 0) && num(x.hits, 0) && num(x.sumQ, 0));
  s.calibration = { buckets: okBuckets ? b : d.calibration.buckets };
  s.seen = Object.fromEntries(Object.entries(s.seen).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.filter((x) => typeof x === 'string')]));
  const dl = s.daily;
  s.daily = {
    results: mapValues(dl.results, (v) => isObj(v) && isObj(v.scores) && num(v.total)),
    streak: num(dl.streak, 0) ? dl.streak : 0,
    best: num(dl.best, 0) ? dl.best : 0,
    lastDate: isDate(dl.lastDate) ? dl.lastDate : null,
    freezes: num(dl.freezes, 0) ? Math.min(2, Math.floor(dl.freezes)) : 0,
    completed: num(dl.completed, 0) ? dl.completed : 0,
    progress: isObj(dl.progress) && isDate(dl.progress.date) && isObj(dl.progress.scores) ? dl.progress : null,
  };
  s.achievements = mapValues(s.achievements, (v) => num(v));
  s.prefs = isObj(s.prefs) ? s.prefs : {};
  s.flags = { welcomed: s.flags.welcomed === true };
  return s;
}

/** Bring any raw saved object up to the current schema and sanitize it. Throws if from a newer version. */
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
  return sanitize(withDefaults(s, defaultState()));
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
  /** If another tab saved a newer revision, adopt it before we write (prevents lost updates). */
  function refresh() {
    try {
      const raw = backend.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (isObj(parsed) && Number.isInteger(parsed.rev) && parsed.rev > state.rev) state = migrate(parsed);
    } catch {
      /* unreadable: keep our in-memory copy */
    }
  }
  function save() {
    state.rev += 1;
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
      refresh();
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
      const next = migrate(incoming);
      next.rev = Math.max(state.rev, next.rev);
      state = next;
      save();
      notify();
    },
    reset() {
      const rev = state.rev;
      state = defaultState();
      state.rev = rev;
      backend.removeItem(key);
      save();
      notify();
    },
  };
}
