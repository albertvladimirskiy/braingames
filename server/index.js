// Optional reference backend for Reps (zero dependencies). Run: `node server/index.js --port 8787`.
// Anonymous devices, state sync, server-verified Daily leaderboard, calibrated benchmarks. See docs/BACKEND_PLAN.md.
import http from 'node:http';
import { createStore } from './store.js';
import { issueToken, verifyAuth } from './auth.js';
import { verifyDaily } from './verify.js';
import { computeBenchmarks } from './benchmarks.js';
import { migrate } from '../js/core/storage.js';
import { utcDate } from '../js/core/daily.js';

const MAX_BODY = 1_000_000;
const RATE = { windowMs: 60_000, max: 120 };
const GRACE_MS = 10 * 60_000; // accept yesterday's date for a few minutes after the UTC rollover
const MAX_DEVICES = 200_000;

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const cleanName = (name, deviceId) => {
  const n = typeof name === 'string' ? [...name].filter((c) => c >= ' ' && c !== '\u007f').join('').trim().slice(0, 20) : '';
  return n || `Player-${deviceId.slice(0, 4)}`;
};

/** Builds the request handler. `now` is injectable for tests. */
export function createApp({ store = createStore(), now = Date.now } = {}) {
  const { data, persist } = store;
  const hits = new Map(); // deviceId|ip → [timestamps]

  function rateLimit(key) {
    const t = now();
    const arr = (hits.get(key) ?? []).filter((x) => t - x < RATE.windowMs);
    arr.push(t);
    hits.set(key, arr);
    if (hits.size > 50_000) hits.clear(); // crude memory guard
    if (arr.length > RATE.max) throw new HttpError(429, 'slow down');
  }

  function auth(req) {
    const id = verifyAuth(data.secret, req.headers.authorization);
    if (!id || !data.devices[id]) throw new HttpError(401, 'missing or invalid token');
    rateLimit(id);
    return id;
  }

  async function readJson(req) {
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) throw new HttpError(413, 'body too large');
      chunks.push(c);
    }
    if (!size) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new HttpError(400, 'invalid JSON');
    }
  }

  const rankOf = (date, deviceId) => {
    const board = leaderboard(date);
    const i = board.findIndex((e) => e.deviceId === deviceId);
    return i < 0 ? null : i + 1;
  };
  function leaderboard(date) {
    return Object.entries(data.daily[date] ?? {})
      .map(([deviceId, e]) => ({ deviceId, ...e }))
      .filter((e) => !e.flagged)
      .sort((a, b) => b.total - a.total || a.submittedAt - b.submittedAt);
  }

  const routes = [
    ['POST', /^\/v1\/device$/, async (req, res, _m, ip) => {
      rateLimit(`ip:${ip}`);
      if (Object.keys(data.devices).length >= MAX_DEVICES) throw new HttpError(503, 'device limit reached');
      const { deviceId, token } = issueToken(data.secret);
      data.devices[deviceId] = { createdAt: now() };
      persist();
      return [201, { deviceId, token }];
    }],

    ['GET', /^\/v1\/state$/, async (req) => {
      const id = auth(req);
      const rec = data.states[id];
      return [200, rec ? { version: rec.version, state: rec.state } : { version: 0, state: null }]; // 200 (not 404) so first sync is not logged as a failed request
    }],

    ['PUT', /^\/v1\/state$/, async (req) => {
      const id = auth(req);
      const body = await readJson(req);
      const rec = data.states[id];
      const ifMatch = req.headers['if-match'];
      if (rec && ifMatch !== undefined && String(rec.version) !== ifMatch) throw new HttpError(409, 'version conflict', { version: rec.version, state: rec.state });
      let state;
      try {
        state = migrate(body.state);
        state.settings.sync = null; // credentials never belong in the stored copy
      } catch (err) {
        throw new HttpError(400, `invalid state: ${err.message}`);
      }
      const version = (rec?.version ?? 0) + 1;
      data.states[id] = { version, state, updatedAt: now() };
      persist();
      return [200, { version }];
    }],

    ['POST', /^\/v1\/daily\/(\d{4}-\d{2}-\d{2})$/, async (req, res, m) => {
      const id = auth(req);
      const date = m[1];
      const t = now();
      if (date !== utcDate(t) && !(date === utcDate(t - GRACE_MS) && utcDate(t) !== date)) throw new HttpError(400, 'only today’s Daily (UTC) can be submitted');
      const body = await readJson(req);
      const day = (data.daily[date] ??= {});
      if (day[id]) throw new HttpError(409, 'already submitted for this date', { total: day[id].total });
      const v = verifyDaily(date, body.answers);
      if (!v.ok) throw new HttpError(422, v.error);
      day[id] = { total: v.total, scores: v.normalized, name: cleanName(body.name, id), flagged: v.flags.length > 0, flags: v.flags, submittedAt: t };
      persist();
      return [201, { total: v.total, scores: v.normalized, flagged: v.flags.length > 0, rank: rankOf(date, id) }];
    }],

    ['GET', /^\/v1\/daily\/(\d{4}-\d{2}-\d{2})\/leaderboard$/, async (req, res, m) => {
      const date = m[1];
      const limit = Math.min(100, Math.max(1, Number(new URL(req.url, 'http://x').searchParams.get('limit')) || 20));
      const board = leaderboard(date);
      const id = verifyAuth(data.secret, req.headers.authorization);
      const mine = id ? data.daily[date]?.[id] : null;
      return [200, {
        date,
        count: board.length,
        entries: board.slice(0, limit).map((e, i) => ({ rank: i + 1, name: e.name, total: e.total, scores: e.scores })),
        me: mine ? { rank: mine.flagged ? null : rankOf(date, id), total: mine.total, flagged: mine.flagged } : null,
      }];
    }],

    ['GET', /^\/v1\/benchmarks$/, async () => [200, computeBenchmarks(Object.values(data.states).map((r) => r.state))]],
  ];

  return async function handler(req, res) {
    const send = (status, body) => {
      res.writeHead(status, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, content-type, if-match',
        'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === 'OPTIONS') return send(204, {});
      const path = new URL(req.url, 'http://x').pathname;
      let pathMatched = false;
      for (const [method, re, fn] of routes) {
        const m = re.exec(path);
        if (!m) continue;
        pathMatched = true;
        if (req.method !== method) continue;
        const [status, body] = await fn(req, res, m, req.socket.remoteAddress ?? 'unknown');
        return send(status, body);
      }
      throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'method not allowed' : 'not found');
    } catch (err) {
      if (err instanceof HttpError) return send(err.status, { error: err.message, ...err.extra });
      console.error(err);
      return send(500, { error: 'internal error' });
    }
  };
}

export function startServer({ port = 8787, file = null, now = Date.now } = {}) {
  const server = http.createServer(createApp({ store: createStore({ file }), now }));
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1]?.endsWith('server/index.js') || process.argv[1]?.endsWith('server\\index.js')) {
  const arg = (name, dflt) => process.argv[process.argv.indexOf(`--${name}`) + 1] ?? dflt;
  const port = Number(arg('port', process.env.PORT ?? 8787));
  const file = arg('data', process.env.REPS_DATA ?? new URL('./data/store.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  startServer({ port, file }).then(() => console.log(`reps server on http://localhost:${port} (data: ${file})`));
}
