import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/prng.js';
import {
  parseEstimate, scoreAnswer, describeMiss, generateNumeric, pickQuestions, summarize, plotX, MAX_POINTS,
} from '../js/games/ballpark/logic.js';
import { BALLPARK_BANK } from '../data/ballpark-bank.js';

const ok = (s) => {
  const r = parseEstimate(s);
  assert.ok(r.ok, `${JSON.stringify(s)} should parse (${r.error})`);
  return r.value;
};
const bad = (s) => {
  const r = parseEstimate(s);
  assert.equal(r.ok, false, `${JSON.stringify(s)} should be rejected, got ${r.value}`);
  assert.ok(typeof r.error === 'string' && r.error.length > 5);
};

test('parseEstimate: plain, grouped, decimal', () => {
  assert.equal(ok('1200'), 1200);
  assert.equal(ok('1,200'), 1200);
  assert.equal(ok('1,234,567'), 1234567);
  assert.equal(ok('1,200.5'), 1200.5);
  assert.equal(ok('  42  '), 42);
  assert.equal(ok('0.25'), 0.25);
  assert.equal(ok('.5'), 0.5);
  assert.equal(ok('$1,500'), 1500);
});

test('parseEstimate: k / m / b / t suffixes, any case', () => {
  assert.equal(ok('3.5k'), 3500);
  assert.equal(ok('2m'), 2e6);
  assert.equal(ok('2M'), 2e6);
  assert.equal(ok('1.2b'), 1.2e9);
  assert.equal(ok('4T'), 4e12);
  assert.equal(ok('1,500k'), 1.5e6);
  assert.equal(ok('0.5m'), 5e5);
});

test('parseEstimate: scientific notation', () => {
  assert.equal(ok('5e6'), 5e6);
  assert.equal(ok('2.5e-3'), 0.0025);
  assert.equal(ok('1E9'), 1e9);
  assert.equal(ok('6.022e+23'), 6.022e23);
});

test('parseEstimate: simple fractions', () => {
  assert.equal(ok('1/4'), 0.25);
  assert.equal(ok('3/8'), 0.375);
  assert.equal(ok('10/4'), 2.5);
  assert.equal(ok(' 1 / 3 '), 1 / 3);
});

test('parseEstimate rejects garbage with a message instead of throwing', () => {
  for (const s of ['', '   ', 'abc', '12abc', 'k', 'm5', '1,2,3', '1,23', '12,34,567', '1..2', '1.2.3', '5e', 'e5', '1e3k', '1/0', '1/', '/2', '1/2/3', '-5', '-1/4', '0', '0k', '1e999', '1e400', '$', '5%', '1 2 x', '∞', 'NaN', 'Infinity', '0x10', '1,000,00']) bad(s);
  assert.equal(parseEstimate(null).ok, false);
  assert.equal(parseEstimate(undefined).ok, false);
  assert.equal(parseEstimate(42).ok, false);
});

test('scoring: exact = 100 + 25 close bonus', () => {
  const r = scoreAnswer({ estimate: 1000, truth: 1000, timeMs: 25000 });
  assert.equal(r.base, 100);
  assert.equal(r.close, 25);
  assert.equal(r.speed, 0);
  assert.equal(r.points, 125);
  assert.equal(r.s, 1);
  assert.equal(r.direction, 'exact');
});

test('scoring: 100·max(0, 1 − err/1.5), symmetric in log space', () => {
  const hi = scoreAnswer({ estimate: 10000, truth: 1000, timeMs: 25000 }); // err 1
  assert.equal(hi.base, 33);
  assert.equal(hi.close, 0);
  assert.equal(hi.s, 0);
  const lo = scoreAnswer({ estimate: 100, truth: 1000, timeMs: 25000 });
  assert.equal(lo.base, 33);
  assert.equal(hi.direction, 'high');
  assert.equal(lo.direction, 'low');
  assert.equal(scoreAnswer({ estimate: 1000 * 10 ** 1.5, truth: 1000, timeMs: 1 }).points, 0, 'beyond 1.5 orders = 0, no speed bonus');
  assert.equal(scoreAnswer({ estimate: 1e9, truth: 1, timeMs: 1000 }).points, 0);
});

test('scoring: within-10% bonus boundaries', () => {
  assert.equal(scoreAnswer({ estimate: 1100, truth: 1000, timeMs: 25000 }).close, 25);
  assert.equal(scoreAnswer({ estimate: 900, truth: 1000, timeMs: 25000 }).close, 25);
  assert.equal(scoreAnswer({ estimate: 1101, truth: 1000, timeMs: 25000 }).close, 0);
  assert.equal(scoreAnswer({ estimate: 899, truth: 1000, timeMs: 25000 }).close, 0);
});

test('scoring: speed bonus up to 10, decays to 0 at 25s, needs a non-zero base', () => {
  assert.equal(scoreAnswer({ estimate: 1000, truth: 1000, timeMs: 0 }).speed, 10);
  assert.equal(scoreAnswer({ estimate: 1000, truth: 1000, timeMs: 12500 }).speed, 5);
  assert.equal(scoreAnswer({ estimate: 1000, truth: 1000, timeMs: 40000 }).speed, 0);
  assert.equal(scoreAnswer({ estimate: 1000, truth: 1000, timeMs: 0 }).points, MAX_POINTS);
});

test('rating signal s = clamp(1 − err, 0, 1)', () => {
  assert.ok(Math.abs(scoreAnswer({ estimate: 2000, truth: 1000 }).s - (1 - Math.log10(2))) < 1e-12);
  assert.equal(scoreAnswer({ estimate: 1e6, truth: 1 }).s, 0);
});

test('describeMiss wording', () => {
  assert.equal(describeMiss(scoreAnswer({ estimate: 1000, truth: 1000 })), 'Spot on!');
  assert.equal(describeMiss(scoreAnswer({ estimate: 3200, truth: 1000 })), 'off by 3.2x (too high)');
  assert.equal(describeMiss(scoreAnswer({ estimate: 100, truth: 1000 })), 'off by 10x (too low)');
  assert.equal(describeMiss(scoreAnswer({ estimate: 5e7, truth: 1000 })), 'off by 50,000x (too high)');
});

test('generated questions: positive finite truths, unique ids per kind, deterministic', () => {
  const rng = createRng('gen');
  const kinds = new Set();
  for (let i = 0; i < 1500; i++) {
    const q = generateNumeric(rng);
    kinds.add(q.id.split(':')[1]);
    assert.ok(q.truth > 0 && Number.isFinite(q.truth), q.text);
    assert.ok(q.text.length > 5 && q.note.length > 3);
  }
  assert.equal(kinds.size, 6);
  assert.equal(generateNumeric(createRng('a')).id, generateNumeric(createRng('a')).id);
});

test('generated truths are right (spot-checks)', () => {
  for (let i = 0; i < 300; i++) {
    const q = generateNumeric(createRng(`chk${i}`));
    const [, kind, ...p] = q.id.split(':');
    if (kind === 'pow') assert.equal(q.truth, 2 ** Number(p[0]));
    if (kind === 'secs') assert.equal(q.truth, Number(p[0]) * 86400);
    if (kind === 'compound') assert.ok(Math.abs(q.truth - Number(p[0]) * (1 + Number(p[1]) / 100) ** Number(p[2])) < 1e-6);
    if (kind === 'double') assert.ok(Math.abs((1 + Number(p[0]) / 100) ** q.truth - 2) < 1e-9);
    if (kind === 'prod') assert.equal(q.truth, p[0].split('x').map(Number).reduce((a, b) => a * b));
  }
});

test('pickQuestions: right count, no duplicates, ~60% bank, honours exclude, deterministic', () => {
  const run = (seed, count, exclude) => pickQuestions(createRng(seed), count, { bank: BALLPARK_BANK, exclude });
  const a = run('p', 8, []);
  assert.equal(a.length, 8);
  assert.equal(new Set(a.map((q) => q.id)).size, 8);
  assert.equal(a.filter((q) => q.id.startsWith('bp-')).length, 5);
  assert.deepEqual(run('p', 8, []).map((q) => q.id), a.map((q) => q.id));
  assert.equal(run('p', 5, []).length, 5);
  const ex = BALLPARK_BANK.slice(0, BALLPARK_BANK.length - 10).map((q) => q.id);
  const b = run('p2', 8, ex);
  assert.ok(b.filter((q) => q.id.startsWith('bp-')).every((q) => !ex.includes(q.id)));
  assert.equal(run('p3', 8, BALLPARK_BANK.map((q) => q.id)).length, 8, 'falls back to the full bank when everything was seen');
});

test('summarize + plotX', () => {
  const s = summarize([{ err: 1, points: 10 }, { err: 0, points: 20 }]);
  assert.equal(s.meanErr, 0.5);
  assert.ok(Math.abs(s.typicalFactor - 10 ** 0.5) < 1e-12);
  assert.equal(s.points, 30);
  assert.equal(summarize([]).n, 0);
  assert.equal(plotX(1000, 1), 3);
  assert.equal(plotX(1e9, 1), 3);
  assert.equal(plotX(1, 1e9), -3);
  assert.equal(plotX(10, 1), 1);
});
