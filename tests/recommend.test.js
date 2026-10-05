import test from 'node:test';
import assert from 'node:assert/strict';
import { recommend } from '../js/core/recommend.js';
import { defaultState } from '../js/core/storage.js';
import { DECKS } from '../js/games/wordbank/decks.js';

const base = (state) => recommend({ state, today: '2026-10-05', dayIdx: 20000, decks: DECKS, categoryOf: () => 'quant' });

test('fresh player: Daily first, then the first skill (all tied at 1000)', () => {
  const r = base(defaultState());
  assert.equal(r[0].kind, 'daily');
  assert.equal(r[0].href, '#/daily');
  assert.equal(r[1].kind, 'skill');
  assert.equal(r[1].href, '#/play/quickmath');
});

test('Daily disappears once completed today', () => {
  const s = defaultState();
  s.daily.results['2026-10-05'] = { scores: {}, total: 500 };
  assert.ok(!base(s).some((x) => x.kind === 'daily'));
});

test('lowest-rated skill drives the skill recommendation', () => {
  const s = defaultState();
  for (const k of ['mental_arithmetic', 'percentages', 'estimation', 'calibration', 'vocab_finance', 'vocab_russian', 'attention']) s.ratings[k] = { r: 1100, n: 10 };
  s.ratings.vocab_italian = { r: 950, n: 10 };
  const skill = base(s).find((x) => x.kind === 'skill');
  assert.equal(skill.href, '#/play/wordbank?deck=italian');
  s.ratings.attention = { r: 800, n: 10 };
  assert.equal(base(s).find((x) => x.kind === 'skill').href, '#/play/stroop');
});

test('ties break toward the skill with fewer rated items', () => {
  const s = defaultState();
  for (const k of ['mental_arithmetic', 'percentages', 'calibration', 'vocab_finance', 'vocab_italian', 'vocab_russian', 'attention']) s.ratings[k] = { r: 1000, n: 20 };
  s.ratings.estimation = { r: 1000, n: 0 };
  assert.equal(base(s).find((x) => x.kind === 'skill').href, '#/play/ballpark');
});

test('a Word Bank deck with due cards is recommended (the one with the most due)', () => {
  const s = defaultState();
  s.srs.italian = Object.fromEntries(DECKS[1].entries.slice(0, 3).map((e) => [e.id, { box: 1, due: 19999, lapses: 0, seen: 1 }]));
  s.srs.russian = Object.fromEntries(DECKS[2].entries.slice(0, 7).map((e) => [e.id, { box: 1, due: 20000, lapses: 0, seen: 1 }]));
  const deck = base(s).find((x) => x.kind === 'deck');
  assert.equal(deck.href, '#/play/wordbank?deck=russian');
  assert.match(deck.sub, /7 cards/);
  s.srs.russian = {};
  s.srs.italian = {};
  assert.ok(!base(s).some((x) => x.kind === 'deck'));
});
