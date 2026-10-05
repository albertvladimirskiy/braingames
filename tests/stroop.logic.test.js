import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/prng.js';
import {
  COLORS, initState, nextTrial, answer, tick, isOver, summarize, pIncongruent, DIFFICULTY, TARGET_MS, WRONG_PENALTY_MS,
} from '../js/games/stroop/logic.js';

/** Run n trials, always answering correctly after `rt` ms; returns trials and final state. */
function run(seed, n, { rt = 700, step = 0 } = {}) {
  const rng = createRng(seed);
  let s = initState(rng);
  const trials = [];
  for (let i = 0; i < n; i++) {
    s = tick(s, step);
    const r = nextTrial(s, rng);
    s = r.state;
    trials.push(r.trial);
    s = answer(s, r.trial, r.trial.answer, rt).state;
  }
  return { trials, s };
}

test('four colours, each with a text name (never colour-only)', () => {
  assert.deepEqual(COLORS.map((c) => c.id), ['red', 'blue', 'green', 'yellow']);
  assert.ok(COLORS.every((c) => /^[A-Z]+$/.test(c.name)));
});

test('congruent trials have ink = word; incongruent trials differ; answer follows the rule', () => {
  const { trials } = run('t', 400, { step: 100 });
  for (const t of trials) {
    assert.equal(t.congruent, t.word === t.ink);
    assert.equal(t.answer, t.rule === 'ink' ? t.ink : t.word);
  }
  assert.ok(trials.some((t) => !t.congruent) && trials.some((t) => t.congruent));
});

test('the incongruent share ramps up over the round', () => {
  assert.ok(Math.abs(pIncongruent(0) - 0.15) < 1e-12);
  assert.ok(Math.abs(pIncongruent(1) - 0.8) < 1e-12);
  const rng = createRng('ramp');
  let s = initState(rng, { durationMs: 45000 });
  const early = [], late = [];
  for (let i = 0; i < 3000; i++) {
    const progress = (i % 1000) / 1000;
    const state = { ...s, timeLeftMs: 45000 * (1 - progress) };
    const { trial } = nextTrial(state, rng);
    (progress < 0.2 ? early : progress > 0.8 ? late : []).push(trial);
  }
  const share = (a) => a.filter((t) => !t.congruent).length / a.length;
  assert.ok(share(early) < 0.3, `${share(early)}`);
  assert.ok(share(late) > 0.6, `${share(late)}`);
});

test('a rule flip happens about every 10 trials, toggles ink ↔ word, and marks the first trial kind=flip', () => {
  const { trials } = run('flip', 120);
  const flips = trials.map((t, i) => (t.kind === 'flip' ? i : -1)).filter((i) => i >= 0);
  assert.ok(flips.length >= 9 && flips.length <= 14, `${flips.length} flips`);
  for (let k = 1; k < flips.length; k++) {
    const gap = flips[k] - flips[k - 1];
    assert.ok(gap >= 9 && gap <= 11, `gap ${gap}`);
  }
  assert.equal(trials[0].rule, 'ink');
  flips.forEach((i, k) => assert.equal(trials[i].rule, k % 2 === 0 ? 'word' : 'ink'));
  for (let i = 1; i < trials.length; i++) if (!flips.includes(i)) assert.equal(trials[i].rule, trials[i - 1].rule);
});

test('deterministic for a seed', () => {
  assert.deepEqual(run('same', 50).trials, run('same', 50).trials);
  assert.notDeepEqual(run('same', 50).trials, run('other', 50).trials);
});

test('scoring: 10 base, +5 under 600ms, streak multiplier from streak before, no time bonus', () => {
  const rng = createRng('sc');
  let s = initState(rng);
  const trial = { word: 'red', ink: 'blue', rule: 'ink', congruent: false, kind: 'incongruent', answer: 'blue' };
  const pts = [];
  for (let i = 0; i < 7; i++) {
    const r = answer(s, trial, 'blue', 500);
    pts.push(r.points);
    s = r.state;
  }
  assert.deepEqual(pts, [15, 15, 15, 15, 15, 30, 30]);
  assert.equal(s.timeLeftMs, 45000, 'no streak time bonus in Stroop');
  assert.equal(answer(s, trial, 'blue', 600).points, 20, '600ms is not "under 600"');
});

test('wrong tap: −2s, streak reset, no points; tapping the ignored dimension is wrong', () => {
  const rng = createRng('w');
  let s = initState(rng);
  const trial = { word: 'red', ink: 'blue', rule: 'ink', congruent: false, kind: 'incongruent', answer: 'blue' };
  s = answer(s, trial, 'blue', 500).state;
  const r = answer(s, trial, 'red', 500); // tapped the word under the ink rule
  assert.equal(r.correct, false);
  assert.equal(r.state.streak, 0);
  assert.equal(r.state.timeLeftMs, 45000 - WRONG_PENALTY_MS);
  assert.equal(r.state.score, s.score);
  assert.equal(r.penaltyMs, 2000);
  assert.ok(isOver(tick({ ...s, timeLeftMs: 10 }, 10)));
  assert.equal(answer({ ...s, timeLeftMs: 500 }, trial, 'red', 100).state.timeLeftMs, 0);
});

test('rating items: d 900/1100/1300 and targets 900/1100/1400 by trial kind', () => {
  assert.deepEqual(DIFFICULTY, { congruent: 900, incongruent: 1100, flip: 1300 });
  assert.deepEqual(TARGET_MS, { congruent: 900, incongruent: 1100, flip: 1400 });
  const s = initState(createRng('i'));
  const flip = { word: 'red', ink: 'red', rule: 'word', congruent: true, kind: 'flip', answer: 'red' };
  const it = answer(s, flip, 'red', 800).item;
  assert.deepEqual([it.skill, it.difficulty, it.targetMs, it.correct], ['attention', 1300, 1400, true]);
});

test('summarize: accuracy, mean RTs and Stroop cost from correct trials only', () => {
  const rng = createRng('sum');
  let s = initState(rng);
  const cong = { word: 'red', ink: 'red', rule: 'ink', congruent: true, kind: 'congruent', answer: 'red' };
  const inc = { word: 'red', ink: 'blue', rule: 'ink', congruent: false, kind: 'incongruent', answer: 'blue' };
  s = answer(s, cong, 'red', 500).state;
  s = answer(s, cong, 'red', 700).state;
  s = answer(s, inc, 'blue', 900).state;
  s = answer(s, inc, 'blue', 1100).state;
  s = answer(s, inc, 'red', 50).state; // wrong: excluded from RT means
  const r = summarize(s);
  assert.equal(r.trials, 5);
  assert.equal(r.accuracy, 0.8);
  assert.equal(r.meanCongruentMs, 600);
  assert.equal(r.meanIncongruentMs, 1000);
  assert.equal(r.stroopCostMs, 400);
  assert.equal(r.bestStreak, 4);
  assert.equal(summarize(initState(rng)).stroopCostMs, null);
});
