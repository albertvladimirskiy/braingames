import test from 'node:test';
import assert from 'node:assert/strict';
import { brier, brierPoints, bucketIndex, addSamples, emptyBuckets, summarize, meanBrier, calibrationSentence } from '../js/core/calibration.js';

test('Brier points: 50% is always 0; 90% right +96; 90% wrong −224', () => {
  assert.equal(brierPoints(0.5, true), 0);
  assert.equal(brierPoints(0.5, false), 0);
  assert.equal(brierPoints(0.9, true), 96);
  assert.equal(brierPoints(0.9, false), -224);
  assert.equal(brierPoints(0.99, true), 100);
  assert.equal(brierPoints(0.99, false), -292);
});

test('brier is (q − o)²', () => {
  assert.ok(Math.abs(brier(0.7, true) - 0.09) < 1e-12);
  assert.ok(Math.abs(brier(0.7, false) - 0.49) < 1e-12);
});

test('bucket edges (incl. float-hostile 0.6/0.7/0.9)', () => {
  const idx = [0.5, 0.59, 0.6, 0.7, 0.8, 0.9, 0.99, 1].map(bucketIndex);
  assert.deepEqual(idx, [0, 0, 1, 2, 3, 4, 4, 4]);
});

test('addSamples aggregates n / hits / sumQ without mutating', () => {
  const base = emptyBuckets();
  const out = addSamples(base, [
    { q: 0.9, correct: true }, { q: 0.9, correct: false }, { q: 0.95, correct: true }, { q: 0.55, correct: true },
  ]);
  assert.equal(base[4].n, 0);
  assert.equal(out[4].n, 3);
  assert.equal(out[4].hits, 2);
  assert.ok(Math.abs(out[4].sumQ - 2.75) < 1e-12);
  assert.equal(out[0].n, 1);
  const again = addSamples(out, [{ q: 0.9, correct: true }]);
  assert.equal(again[4].n, 4);
});

test('summarize returns stated vs actual', () => {
  const s = summarize(addSamples(emptyBuckets(), [{ q: 0.9, correct: true }, { q: 0.9, correct: false }]));
  assert.equal(s[4].stated, 0.9);
  assert.equal(s[4].actual, 0.5);
  assert.equal(s[0].stated, null);
});

test('meanBrier', () => {
  assert.ok(Math.abs(meanBrier([{ q: 0.5, correct: true }, { q: 0.5, correct: false }]) - 0.25) < 1e-12);
  assert.equal(meanBrier([]), 0);
});

test('sentence names over/under confidence', () => {
  const over = [];
  for (let i = 0; i < 10; i++) over.push({ q: 0.9, correct: i < 7 });
  assert.equal(calibrationSentence(addSamples(emptyBuckets(), over)), 'You said ~90% but were right 70% of the time: overconfident.');
  const under = [];
  for (let i = 0; i < 10; i++) under.push({ q: 0.6, correct: i < 9 });
  assert.match(calibrationSentence(addSamples(emptyBuckets(), under)), /underconfident/);
  const good = [];
  for (let i = 0; i < 10; i++) good.push({ q: 0.8, correct: i < 8 });
  assert.match(calibrationSentence(addSamples(emptyBuckets(), good)), /well calibrated/);
  assert.match(calibrationSentence(emptyBuckets()), /Answer a few/);
});
