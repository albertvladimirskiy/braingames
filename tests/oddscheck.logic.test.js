import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/prng.js';
import { buildProblem, buildOptions, pointsFor, sessionItems, QUESTION_MS } from '../js/games/oddscheck/logic.js';
import { applyItems } from '../js/core/rating.js';
import oddscheck from '../js/games/oddscheck/index.js';
import { GAME_GRADES } from '../js/core/benchmarks.js';

test('problems: counts add up, answer is an exact whole percent below the sensitivity', () => {
  const rng = createRng('odds');
  for (let i = 0; i < 1500; i++) {
    const p = buildProblem(rng);
    assert.equal(p.tp + p.fn, p.k);
    assert.equal(p.fp + p.tn, p.rest);
    assert.equal(p.k + p.rest, p.n);
    assert.ok(p.fp >= 1 && p.tn >= 0 && p.fn >= 0);
    assert.ok(Number.isInteger(p.pct) && p.pct >= 4 && p.pct <= 99);
    assert.equal((p.tp * 100) / (p.tp + p.fp), p.pct, 'exact percent, no rounding');
    assert.ok(p.pct < (p.tp / p.k) * 100, 'false positives drag the answer below the sensitivity');
    assert.ok(p.text.includes(p.n.toLocaleString('en-US')) && p.text.includes(p.fp.toLocaleString('en-US')));
    assert.ok(p.explanation.includes(`${p.pct}%`));
  }
});

test('problems vary in numbers and wording and are deterministic per seed', () => {
  const rng = createRng('var');
  const ps = Array.from({ length: 300 }, () => buildProblem(rng));
  assert.ok(new Set(ps.map((p) => p.text)).size > 150);
  assert.ok(new Set(ps.map((p) => p.scenario.n)).size === 4);
  assert.equal(buildProblem(createRng('same')).text, buildProblem(createRng('same')).text);
});

test('options: 4 distinct whole percents, correct one included, includes the sensitivity trap when possible', () => {
  const rng = createRng('opt');
  let withSens = 0;
  for (let i = 0; i < 800; i++) {
    const p = buildProblem(rng);
    const o = buildOptions(p, rng);
    assert.equal(o.options.length, 4);
    assert.equal(new Set(o.options).size, 4);
    assert.equal(o.options[o.correctIndex], p.pct);
    assert.ok(o.options.every((v) => Number.isInteger(v) && v >= 1 && v <= 99));
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) assert.ok(Math.abs(o.options[a] - o.options[b]) >= 3, o.options.join());
    if (o.options.includes(o.sens)) withSens++;
  }
  assert.ok(withSens > 600, `sensitivity trap offered in ${withSens}/800`);
});

test('scoring and rating item', () => {
  assert.equal(pointsFor(false, 0), 0);
  assert.equal(pointsFor(true, 0), 100);
  assert.equal(pointsFor(true, QUESTION_MS), 60);
  assert.equal(pointsFor(true, QUESTION_MS / 2), 80);
  const items = sessionItems([{ correct: true }, { correct: false }, { correct: true }, { correct: true }]);
  assert.equal(items.length, 1);
  assert.equal(items[0].s, 0.75);
  assert.equal(items[0].k, 40);
  assert.equal(applyItems({}, items).ratings.calibration.n, 1);
  assert.deepEqual(sessionItems([]), []);
});

test('plugin contract: manifest shape, grade table exists', () => {
  for (const k of ['id', 'name', 'category', 'skills', 'blurb', 'durationSec', 'create']) assert.ok(oddscheck[k] !== undefined, k);
  assert.ok(['quant', 'language', 'reasoning', 'reflex'].includes(oddscheck.category));
  assert.ok(GAME_GRADES[oddscheck.id]);
});
