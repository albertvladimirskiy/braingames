// Server-side Daily verification: replays the submitted answer logs against the content that the seed
// (daily:<date>:<game>) deterministically generates, using the SAME logic modules as the client.
import { createRng } from '../js/core/prng.js';
import { dailySeed, SEGMENTS, normalizeSegment } from '../js/core/daily.js';
import { initState, problemFor, tick, resolve } from '../js/games/quickmath/logic.js';
import { buildSet as ballparkSet, scoreAnswer } from '../js/games/ballpark/logic.js';
import { buildSet as sureSet, scoreQuestion } from '../js/games/sure/logic.js';

const TIME_TOLERANCE_MS = 60; // rounding of per-answer times (Math.round on every answer)
const MIN_HUMAN_MS = { quickmath: 100, ballpark: 800, sure: 700 };
const seg = (id) => SEGMENTS.find((s) => s.gameId === id);
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const fail = (error) => ({ ok: false, error });
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

export function verifyQuickMath(date, log) {
  if (!Array.isArray(log) || log.length === 0 || log.length > 500) return fail('quickmath log missing or too long');
  const durationMs = seg('quickmath').durationSec * 1000;
  const seed = dailySeed(date, 'quickmath');
  let state = initState({ mode: 'daily', durationMs });
  for (const e of log) {
    if (!isObj(e) || !(e.v === null || Number.isSafeInteger(e.v)) || !Number.isFinite(e.t) || e.t < 0 || e.t > durationMs * 2) return fail('bad quickmath entry');
    if (state.timeLeftMs <= 0) return fail('answer after time expired');
    state = tick(state, e.t);
    if (state.timeLeftMs < -TIME_TOLERANCE_MS) return fail('answer after time expired');
    const problem = problemFor(state, { seed });
    state = resolve(state, e.v === null ? 'skip' : e.v === problem.answer ? 'correct' : 'wrong').state;
  }
  return { ok: true, score: state.score, times: log.map((e) => e.t) };
}

export function verifyBallpark(date, log) {
  const n = seg('ballpark').questions;
  if (!Array.isArray(log) || log.length !== n) return fail('ballpark log must have one entry per question');
  const questions = ballparkSet(createRng(dailySeed(date, 'ballpark')), n, []);
  let score = 0;
  for (const [i, e] of log.entries()) {
    if (!isObj(e) || !Number.isFinite(e.e) || e.e <= 0 || !Number.isFinite(e.t) || e.t < 0 || e.t > 3600000) return fail('bad ballpark entry');
    score += scoreAnswer({ estimate: e.e, truth: questions[i].truth, timeMs: e.t }).points;
  }
  return { ok: true, score, times: log.map((e) => e.t) };
}

export function verifySure(date, log) {
  const n = seg('sure').questions;
  if (!Array.isArray(log) || log.length !== n) return fail('sure log must have one entry per question');
  const questions = sureSet(createRng(dailySeed(date, 'sure')), n, []);
  let score = 0;
  for (const [i, e] of log.entries()) {
    if (!isObj(e) || ![null, 'T', 'F'].includes(e.c) || !Number.isFinite(e.t) || e.t < 0 || e.t > 3600000) return fail('bad sure entry');
    if (e.c === null) continue; // timed out before choosing: 0 points
    if (!Number.isInteger(e.p) || e.p < 50 || e.p > 99) return fail('bad confidence');
    score += scoreQuestion({ chosen: e.c === 'T', truth: questions[i].answer, confidence: e.p }).points;
  }
  return { ok: true, score, times: log.map((e) => e.t) };
}

const VERIFIERS = { quickmath: verifyQuickMath, ballpark: verifyBallpark, sure: verifySure };

/** answers = { quickmath: [...], ballpark: [...], sure: [...] }. Returns the authoritative result. */
export function verifyDaily(date, answers) {
  if (!isObj(answers)) return fail('answers missing');
  const raw = {};
  const normalized = {};
  const flags = [];
  for (const { gameId } of SEGMENTS) {
    const r = VERIFIERS[gameId](date, answers[gameId]);
    if (!r.ok) return fail(`${gameId}: ${r.error}`);
    raw[gameId] = r.score;
    normalized[gameId] = normalizeSegment(gameId, r.score);
    if (r.times.length >= 3 && (median(r.times) < MIN_HUMAN_MS[gameId] || Math.min(...r.times) < 20)) flags.push(`${gameId}: implausibly fast`);
  }
  return { ok: true, raw, normalized, total: Object.values(normalized).reduce((a, b) => a + b, 0), flags };
}
