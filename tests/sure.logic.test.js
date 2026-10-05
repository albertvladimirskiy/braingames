import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/prng.js';
import { pickQuestions, scoreQuestion, ratingSignal, summarizeSession, CONF_SNAPS } from '../js/games/sure/logic.js';
import { applyItems } from '../js/core/rating.js';
import { TF_QUESTIONS } from '../data/tf-questions.js';

test('snap values are 50,60,70,80,90,99', () => assert.deepEqual(CONF_SNAPS, [50, 60, 70, 80, 90, 99]));

test('scoreQuestion: right at 90 → +96, wrong at 90 → −224, 50 → 0', () => {
  assert.equal(scoreQuestion({ chosen: true, truth: true, confidence: 90 }).points, 96);
  assert.equal(scoreQuestion({ chosen: true, truth: false, confidence: 90 }).points, -224);
  assert.equal(scoreQuestion({ chosen: false, truth: true, confidence: 50 }).points, 0);
  const r = scoreQuestion({ chosen: false, truth: false, confidence: 70 });
  assert.ok(r.correct);
  assert.ok(Math.abs(r.brier - 0.09) < 1e-12);
});

test('pickQuestions: count, distinct, roughly balanced, deterministic', () => {
  for (const n of [6, 10]) {
    const picked = pickQuestions(createRng(`s${n}`), TF_QUESTIONS, n);
    assert.equal(picked.length, n);
    assert.equal(new Set(picked.map((q) => q.id)).size, n);
    const trues = picked.filter((q) => q.answer).length;
    assert.ok(Math.abs(trues - n / 2) <= 1, `${trues}/${n}`);
  }
  const a = pickQuestions(createRng('d'), TF_QUESTIONS, 10).map((q) => q.id);
  const b = pickQuestions(createRng('d'), TF_QUESTIONS, 10).map((q) => q.id);
  assert.deepEqual(a, b);
});

test('pickQuestions prefers unseen ids but falls back when needed', () => {
  const seen = TF_QUESTIONS.slice(0, 60).map((q) => q.id);
  const picked = pickQuestions(createRng('x'), TF_QUESTIONS, 10, seen);
  assert.ok(picked.every((q) => !seen.includes(q.id)));
  const all = TF_QUESTIONS.map((q) => q.id);
  assert.equal(pickQuestions(createRng('y'), TF_QUESTIONS, 10, all).length, 10);
});

test('rating signal s = clamp(1 − B/0.25, 0, 1)', () => {
  assert.equal(ratingSignal(0), 1);
  assert.equal(ratingSignal(0.25), 0);
  assert.equal(ratingSignal(0.5), 0);
  assert.ok(Math.abs(ratingSignal(0.1) - 0.6) < 1e-12);
});

const ans = (confidence, correct, extra = {}) => ({ id: 'x', chosen: true, truth: correct, confidence, correct, points: correct ? 96 : -224, timedOut: false, timeMs: 1000, ...extra });

test('summarizeSession: Brier, score, samples, exactly one rated item (K=40, d=1100)', () => {
  const s = summarizeSession([ans(90, true), ans(90, false), ans(50, true)]);
  assert.equal(s.answered, 3);
  assert.equal(s.score, 96 - 224 + 96);
  assert.ok(Math.abs(s.brier - (0.01 + 0.81 + 0.25) / 3) < 1e-12);
  assert.deepEqual(s.samples.map((x) => x.q), [0.9, 0.9, 0.5]);
  const rated = s.items.filter((i) => !i.noRating);
  assert.equal(rated.length, 1);
  assert.equal(rated[0].k, 40);
  assert.equal(rated[0].difficulty, 1100);
  assert.ok(Math.abs(rated[0].s - ratingSignal(s.brier)) < 1e-12);
});

test('timed-out questions are excluded from calibration; empty session has no rated item', () => {
  const s = summarizeSession([ans(90, true), { ...ans(50, false), timedOut: true, points: 0 }]);
  assert.equal(s.answered, 1);
  assert.equal(s.samples.length, 1);
  assert.equal(summarizeSession([{ ...ans(50, false), timedOut: true, points: 0 }]).items.length, 0);
});

test('calibration rating updates once per session, not per item', () => {
  const s = summarizeSession(Array.from({ length: 10 }, (_, i) => ans(80, i < 8)));
  const { ratings } = applyItems({}, s.items);
  assert.equal(ratings.calibration.n, 1);
  assert.ok(ratings.calibration.r > 1000, 'a well-calibrated session raises the rating');
  const bad = summarizeSession(Array.from({ length: 10 }, () => ans(99, false)));
  assert.ok(applyItems({}, bad.items).ratings.calibration.r < 1000);
});
