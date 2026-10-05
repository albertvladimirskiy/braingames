// Optional cloud link (OFF by default). Talks to the reference server in /server (see docs/BACKEND_PLAN.md).
// Nothing is sent unless the player connects a server URL in Settings. Play never waits on the network.
import { mergeStates } from './merge.js';
import { applyCalibration } from './benchmarks.js';

const DEBOUNCE_MS = 4000;
const BENCH_KEY = 'reps:benchmarks';
export const NOT_CONNECTED = { ok: false, error: 'not connected' };

export function createSync({ storage, fetchImpl = (...a) => fetch(...a), setTimer = setTimeout, clearTimer = clearTimeout, cache = globalThis.localStorage }) {
  let timer = null;
  let syncing = false;
  let lastSyncedRev = -1;
  let version = null; // server state version we last saw
  const status = { state: 'off', message: '', at: 0 }; // off | idle | syncing | error

  const cfg = () => storage.get().settings.sync;
  const connected = () => !!cfg();
  const setStatus = (state, message = '') => Object.assign(status, { state, message, at: Date.now() });

  async function call(method, path, { body, headers = {}, auth = true } = {}) {
    const c = cfg();
    if (!c) throw new Error('not connected');
    const res = await fetchImpl(`${c.url}${path}`, {
      method,
      headers: { ...(auth ? { authorization: `Bearer ${c.token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* empty body */
    }
    return { status: res.status, json };
  }

  /** Register an anonymous device with the server at `url`. */
  async function connect(url, name = '') {
    const clean = String(url).trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(clean)) throw new Error('Enter a full server URL starting with http:// or https://');
    const res = await fetchImpl(`${clean}/v1/device`, { method: 'POST' });
    if (!res.ok) throw new Error(`server answered ${res.status}`);
    const { deviceId, token } = await res.json();
    storage.update((s) => (s.settings.sync = { url: clean, deviceId, token, name: String(name).slice(0, 20) }));
    setStatus('idle', 'Connected');
    return syncNow();
  }

  /** A copy-pasteable code that links another device to this same anonymous identity (keep it private). */
  function linkCode() {
    const c = cfg();
    return c ? `reps-link:${btoa(JSON.stringify({ u: c.url, i: c.deviceId, t: c.token })).replaceAll('+', '-').replaceAll('/', '_')}` : null;
  }

  async function connectWithCode(code, name = '') {
    let parsed;
    try {
      parsed = JSON.parse(atob(String(code).trim().replace(/^reps-link:/, '').replaceAll('-', '+').replaceAll('_', '/')));
    } catch {
      throw new Error('That link code is not valid.');
    }
    if (!/^https?:\/\//.test(parsed.u ?? '') || typeof parsed.i !== 'string' || typeof parsed.t !== 'string') throw new Error('That link code is not valid.');
    storage.update((s) => (s.settings.sync = { url: parsed.u.replace(/\/+$/, ''), deviceId: parsed.i, token: parsed.t, name: String(name).slice(0, 20) }));
    const r = await syncNow();
    if (!r.ok) {
      storage.update((s) => (s.settings.sync = null));
      throw new Error(r.error);
    }
    return r;
  }

  function disconnect() {
    clearTimer(timer);
    storage.update((s) => (s.settings.sync = null));
    setStatus('off');
  }

  /** Pull, merge, push. Safe to call any time; failures leave local data untouched. */
  async function syncNow() {
    if (!connected()) return NOT_CONNECTED;
    if (syncing) return { ok: false, error: 'already syncing' };
    syncing = true;
    setStatus('syncing');
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const got = await call('GET', '/v1/state');
        if (got.status === 401) throw new Error('the server no longer accepts this device; reconnect in Settings');
        if (got.status !== 200) throw new Error(`server answered ${got.status}`);
        const hasRemote = got.json.state !== null;
        if (hasRemote) {
          version = got.json.version;
          storage.update((s) => {
            const merged = mergeStates(s, got.json.state);
            for (const k of Object.keys(merged)) if (k !== 'settings' && k !== 'rev') s[k] = merged[k];
          });
        }
        const put = await call('PUT', '/v1/state', { body: { state: { ...storage.get(), settings: { ...storage.get().settings, sync: null } } }, headers: hasRemote ? { 'if-match': String(version) } : {} });
        if (put.status === 409) continue; // someone else wrote in between: pull and merge again
        if (put.status !== 200) throw new Error(put.json?.error ?? `server answered ${put.status}`);
        version = put.json.version;
        lastSyncedRev = storage.get().rev;
        setStatus('idle', 'Synced');
        return { ok: true, version };
      }
      throw new Error('could not reconcile with the server; try again');
    } catch (err) {
      setStatus('error', err.message);
      return { ok: false, error: err.message };
    } finally {
      syncing = false;
    }
  }

  /** Debounced background sync after local changes. */
  function schedule() {
    if (!connected() || syncing) return;
    clearTimer(timer);
    timer = setTimer(() => {
      if (storage.get().rev !== lastSyncedRev) syncNow();
    }, DEBOUNCE_MS);
  }

  async function submitDaily(date, answers) {
    if (!connected()) return NOT_CONNECTED;
    try {
      const r = await call('POST', `/v1/daily/${date}`, { body: { answers, name: cfg().name } });
      return r.status === 201 ? { ok: true, ...r.json } : { ok: false, status: r.status, error: r.json?.error ?? `server answered ${r.status}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async function leaderboard(date, limit = 10) {
    if (!connected()) return NOT_CONNECTED;
    try {
      const r = await call('GET', `/v1/daily/${date}/leaderboard?limit=${limit}`);
      return r.status === 200 ? { ok: true, ...r.json } : { ok: false, error: r.json?.error ?? `server answered ${r.status}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /** Fetch calibrated benchmark cutoffs and apply them; the last good answer is cached for offline use. */
  async function refreshBenchmarks() {
    if (!connected()) return false;
    try {
      const r = await call('GET', '/v1/benchmarks', { auth: false });
      if (r.status !== 200) return false;
      try {
        cache?.setItem(BENCH_KEY, JSON.stringify(r.json));
      } catch {
        /* storage full or blocked */
      }
      return applyCalibration(r.json);
    } catch {
      return false;
    }
  }

  /** Re-apply the cached calibration at startup so offline sessions use the same cutoffs. */
  function loadCachedBenchmarks() {
    try {
      return applyCalibration(JSON.parse(cache?.getItem(BENCH_KEY) ?? 'null'));
    } catch {
      return false;
    }
  }

  const unsubscribe = storage.subscribe(schedule);
  return { connected, connect, connectWithCode, linkCode, disconnect, syncNow, schedule, submitDaily, leaderboard, refreshBenchmarks, loadCachedBenchmarks, status, destroy: () => { unsubscribe(); clearTimer(timer); } };
}
