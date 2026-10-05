// Content validators: required fields, unique ids, sanity limits. (Fact-checking is the manual audit in docs/DECISIONS.md.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { TF_QUESTIONS } from '../data/tf-questions.js';
import { BALLPARK_BANK } from '../data/ballpark-bank.js';

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;
const dupes = (arr) => arr.filter((x, i) => arr.indexOf(x) !== i);

test('true/false: 120+ statements, unique ids and texts', () => {
  assert.ok(TF_QUESTIONS.length >= 120, `only ${TF_QUESTIONS.length}`);
  assert.deepEqual(dupes(TF_QUESTIONS.map((q) => q.id)), []);
  assert.deepEqual(dupes(TF_QUESTIONS.map((q) => q.text)), []);
});

test('true/false: required fields and value ranges', () => {
  const tags = new Set(['finance', 'stats', 'science', 'history', 'geography']);
  for (const q of TF_QUESTIONS) {
    assert.ok(nonEmpty(q.id) && nonEmpty(q.text), q.id);
    assert.equal(typeof q.answer, 'boolean', q.id);
    assert.ok(tags.has(q.tag), `${q.id} tag ${q.tag}`);
    assert.ok(Number.isInteger(q.difficulty) && q.difficulty >= 1 && q.difficulty <= 5, q.id);
    assert.ok(nonEmpty(q.explanation), `${q.id} needs an explanation`);
    assert.ok(q.text.length < 200 && q.explanation.length < 220, `${q.id} too long`);
    assert.ok(/[.?]$/.test(q.text) && /[.?]$/.test(q.explanation), `${q.id} should end with punctuation`);
  }
});

test('true/false: roughly balanced overall and within every topic', () => {
  const frac = (list) => list.filter((q) => q.answer).length / list.length;
  const overall = frac(TF_QUESTIONS);
  assert.ok(overall >= 0.42 && overall <= 0.58, `overall true share ${overall.toFixed(2)}`);
  for (const tag of new Set(TF_QUESTIONS.map((q) => q.tag))) {
    const f = frac(TF_QUESTIONS.filter((q) => q.tag === tag));
    assert.ok(f >= 0.3 && f <= 0.8, `${tag} true share ${f.toFixed(2)}`);
  }
});

test('true/false: every topic has at least 20 statements and all difficulties are used', () => {
  for (const tag of ['finance', 'stats', 'science', 'history', 'geography']) {
    assert.ok(TF_QUESTIONS.filter((q) => q.tag === tag).length >= 20, tag);
  }
  assert.equal(new Set(TF_QUESTIONS.map((q) => q.difficulty)).size >= 4, true);
});

test('ballpark: 60+ items, unique ids, truth > 0, required fields', () => {
  assert.ok(BALLPARK_BANK.length >= 60, `only ${BALLPARK_BANK.length}`);
  assert.deepEqual(dupes(BALLPARK_BANK.map((q) => q.id)), []);
  assert.deepEqual(dupes(BALLPARK_BANK.map((q) => q.text)), []);
  for (const q of BALLPARK_BANK) {
    assert.ok(nonEmpty(q.id) && nonEmpty(q.text) && nonEmpty(q.tag) && nonEmpty(q.note), q.id);
    assert.equal(typeof q.unit, 'string', q.id);
    assert.ok(typeof q.truth === 'number' && Number.isFinite(q.truth) && q.truth > 0, `${q.id} truth`);
    assert.ok(Number.isInteger(q.difficulty) && q.difficulty >= 1 && q.difficulty <= 5, q.id);
  }
});

test('ballpark: spread of magnitudes and difficulties', () => {
  const mags = BALLPARK_BANK.map((q) => Math.floor(Math.log10(q.truth)));
  assert.ok(Math.max(...mags) - Math.min(...mags) >= 20, 'bank should span many orders of magnitude');
  assert.ok(new Set(BALLPARK_BANK.map((q) => q.difficulty)).size === 5);
});
