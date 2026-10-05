import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRng } from '../js/core/prng.js';
import { dailySeed } from '../js/core/daily.js';
import { buildSet as ballparkSet } from '../js/games/ballpark/logic.js';
import { buildSet as sureSet } from '../js/games/sure/logic.js';
import { initState, problemFor, tick, resolve, isOver } from '../js/games/quickmath/logic.js';
import { defaultState } from '../js/core/storage.js';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';
import { percentile, computeBenchmarks, MIN_RUNS } from '../server/benchmarks.js';
import { verifyAuth, issueToken } from '../server/auth.js';

let server, base, clock;
const store = createStore();
before(async () => {
  clock = Date.UTC(2026, 9, 5, 12, 0, 0);
  server = http.createServer(createApp({ store, now: () => clock }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));

const api = async (method, path, { token, body, headers = {} } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, json: res.status === 204 ? null : await res.json(), headers: res.headers };
};
const newDevice = async () => (await api('POST', '/v1/device')).json;

function honestAnswers(date, { ms = 900 } = {}) {
  let s = initState({ mode: 'daily', durationMs: 45000 });
  const qm = [];
  while (qm.length < 400) {
    s = tick(s, ms);
    if (isOver(s)) break;
    const p = problemFor(s, { seed: dailySeed(date, 'quickmath') });
    qm.push({ v: p.answer, t: ms });
    s = resolve(s, 'correct').state;
  }
  const ballpark = ballparkSet(createRng(dailySeed(date, 'ballpark')), 5, []).map((q) => ({ e: q.truth, t: 6000 }));
  const sure = sureSet(createRng(dailySeed(date, 'sure')), 6, []).map((q) => ({ c: q.answer ? 'T' : 'F', p: 90, t: 4000 }));
  return { quickmath: qm, ballpark, sure };
}

test('auth: devices get signed tokens; missing, malformed and tampered tokens are rejected', async () => {
  const d = await newDevice();
  assert.match(d.token, /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
  assert.equal((await api('GET', '/v1/state')).status, 401);
  assert.equal((await api('GET', '/v1/state', { token: 'garbage' })).status, 401);
  assert.equal((await api('GET', '/v1/state', { token: d.token.slice(0, -2) + 'xx' })).status, 401);
  const other = await newDevice();
  const [id] = d.token.split('.');
  assert.equal((await api('GET', '/v1/state', { token: `${id}.${other.token.split('.')[1]}` })).status, 401, 'signature of another device');
  assert.equal(verifyAuth('s', 'Bearer nope'), null);
  const t = issueToken('s');
  assert.equal(verifyAuth('s', `Bearer ${t.token}`), t.deviceId);
  assert.equal(verifyAuth('other-secret', `Bearer ${t.token}`), null);
});

test('state sync: PUT/GET, optimistic concurrency with If-Match, sanitising of hostile state', async () => {
  const { token } = await newDevice();
  const empty = await api('GET', '/v1/state', { token });
  assert.deepEqual([empty.status, empty.json.version, empty.json.state], [200, 0, null]);
  const s1 = { ...defaultState(), xp: 120 };
  const put1 = await api('PUT', '/v1/state', { token, body: { state: s1 } });
  assert.deepEqual([put1.status, put1.json.version], [200, 1]);
  const got = await api('GET', '/v1/state', { token });
  assert.equal(got.json.state.xp, 120);
  assert.equal((await api('PUT', '/v1/state', { token, body: { state: { ...s1, xp: 130 } }, headers: { 'if-match': '1' } })).json.version, 2);
  const stale = await api('PUT', '/v1/state', { token, body: { state: { ...s1, xp: 999 } }, headers: { 'if-match': '1' } });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.state.xp, 130, 'conflict returns the server copy');
  const hostile = await api('PUT', '/v1/state', { token, body: { state: { v: 1, history: 'x', xp: 'a', ratings: { attention: { r: 'z' } } } } });
  assert.equal(hostile.status, 200);
  const clean = (await api('GET', '/v1/state', { token })).json.state;
  assert.deepEqual([clean.xp, clean.history, clean.ratings], [0, [], {}]);
  assert.equal((await api('PUT', '/v1/state', { token, body: { state: 5 } })).status, 400);
  assert.equal((await api('PUT', '/v1/state', { token, body: { state: { v: 99 } } })).status, 400, 'newer schema rejected');
  assert.equal((await api('PUT', '/v1/state', { token, body: '{ not json' })).status, 400);
});

test('daily: verified submission, duplicate protection, leaderboard order, flagged entries hidden', async () => {
  const date = '2026-10-05';
  const a = await newDevice();
  const b = await newDevice();
  const c = await newDevice();
  const ra = await api('POST', `/v1/daily/${date}`, { token: a.token, body: { answers: honestAnswers(date, { ms: 900 }), name: '  Alice\u0007  ' } });
  assert.equal(ra.status, 201, JSON.stringify(ra.json));
  assert.equal(ra.json.rank, 1);
  assert.ok(ra.json.total > 500);
  const rb = await api('POST', `/v1/daily/${date}`, { token: b.token, body: { answers: { ...honestAnswers(date, { ms: 1400 }), sure: honestAnswers(date).sure.map((e) => ({ ...e, p: 60 })) }, name: 'Bob' } });
  assert.equal(rb.status, 201);
  assert.ok(rb.json.total < ra.json.total);
  assert.equal(rb.json.rank, 2);

  assert.equal((await api('POST', `/v1/daily/${date}`, { token: a.token, body: { answers: honestAnswers(date) } })).status, 409, 'first attempt only');
  const bot = honestAnswers(date);
  bot.ballpark = bot.ballpark.map((e) => ({ ...e, t: 3 }));
  const rc = await api('POST', `/v1/daily/${date}`, { token: c.token, body: { answers: bot } });
  assert.equal(rc.status, 201);
  assert.equal(rc.json.flagged, true);
  assert.equal(rc.json.rank, null);

  const lb = await api('GET', `/v1/daily/${date}/leaderboard`, { token: b.token });
  assert.equal(lb.json.count, 2);
  assert.deepEqual(lb.json.entries.map((e) => e.name), ['Alice', 'Bob'], 'control characters stripped, order by total');
  assert.equal(lb.json.me.rank, 2);
  const anon = await api('GET', `/v1/daily/${date}/leaderboard?limit=1`);
  assert.equal(anon.json.entries.length, 1);
  assert.equal(anon.json.me, null);
  const flaggedView = await api('GET', `/v1/daily/${date}/leaderboard`, { token: c.token });
  assert.deepEqual([flaggedView.json.me.rank, flaggedView.json.me.flagged], [null, true]);
});

test('daily: rejects bad dates, forged answers and the wrong day; accepts yesterday only briefly after the rollover', async () => {
  const d = await newDevice();
  const ans = honestAnswers('2026-10-05');
  assert.equal((await api('POST', '/v1/daily/2026-10-04', { token: d.token, body: { answers: ans } })).status, 400, 'past date');
  assert.equal((await api('POST', '/v1/daily/2026-10-06', { token: d.token, body: { answers: ans } })).status, 400, 'future date');
  assert.equal((await api('POST', '/v1/daily/not-a-date', { token: d.token, body: {} })).status, 404);
  assert.equal((await api('POST', '/v1/daily/2026-10-05', { token: d.token, body: { answers: { quickmath: [], ballpark: [], sure: [] } } })).status, 422);
  assert.equal((await api('POST', '/v1/daily/2026-10-05', { token: d.token, body: {} })).status, 422);
  assert.equal((await api('POST', '/v1/daily/2026-10-05', { body: { answers: ans } })).status, 401);
  // 00:05 UTC the next day: yesterday still accepted (grace), 00:30 not
  clock = Date.UTC(2026, 9, 6, 0, 5);
  assert.equal((await api('POST', '/v1/daily/2026-10-05', { token: d.token, body: { answers: ans } })).status, 201);
  clock = Date.UTC(2026, 9, 6, 0, 30);
  const e = await newDevice();
  assert.equal((await api('POST', '/v1/daily/2026-10-05', { token: e.token, body: { answers: ans } })).status, 400);
  clock = Date.UTC(2026, 9, 5, 12);
});

test('hardening: body size limit, CORS preflight, unknown routes and methods, rate limiting', async () => {
  const d = await newDevice();
  const big = JSON.stringify({ state: defaultState(), pad: 'x'.repeat(1_100_000) });
  assert.equal((await api('PUT', '/v1/state', { token: d.token, body: big })).status, 413);
  const pre = await fetch(`${base}/v1/state`, { method: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), '*');
  assert.match(pre.headers.get('access-control-allow-headers'), /authorization/);
  assert.equal((await api('GET', '/nope')).status, 404);
  assert.equal((await api('DELETE', '/v1/state', { token: d.token })).status, 405);
  let last;
  for (let i = 0; i < 125; i++) last = await api('GET', '/v1/state', { token: d.token });
  assert.equal(last.status, 429);
});

test('benchmarks: percentile math; placeholder until enough devices/runs, then calibrated cutoffs', async () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(percentile([10, 20], 0.5), 15);
  assert.ok(Number.isNaN(percentile([], 0.5)));
  assert.equal(computeBenchmarks([defaultState()]).source, 'placeholder');

  const mk = (scores) => ({ ...defaultState(), history: scores.map((s, i) => ({ gameId: 'quickmath', mode: 'free', score: s, at: i })) });
  const states = Array.from({ length: 6 }, (_, i) => mk(Array.from({ length: MIN_RUNS / 5 }, (_, k) => 100 + i * 50 + k * 10)));
  const b = computeBenchmarks(states);
  assert.equal(b.source, 'calibrated');
  assert.equal(b.games.quickmath.length, 3);
  assert.ok(b.games.quickmath[0] < b.games.quickmath[1] && b.games.quickmath[1] < b.games.quickmath[2]);
  assert.equal(b.games.ballpark, undefined, 'games without enough data stay on placeholders');
  assert.equal(computeBenchmarks(states.slice(0, 2)).source, 'placeholder', 'too few devices');
  assert.equal(computeBenchmarks([mk(Array(40).fill(300))]).source, 'placeholder', 'one device cannot calibrate');
  const daily = states.map((s) => ({ ...s, history: s.history.map((h) => ({ ...h, mode: 'daily' })) }));
  assert.equal(computeBenchmarks(daily).source, 'placeholder', 'daily runs are excluded');

  // end to end through HTTP
  for (const s of states) {
    const d = await newDevice();
    await api('PUT', '/v1/state', { token: d.token, body: { state: s } });
  }
  const res = await api('GET', '/v1/benchmarks');
  assert.equal(res.json.source, 'calibrated');
  assert.equal(res.json.games.quickmath.length, 3);
});
