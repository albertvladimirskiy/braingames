import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/prng.js';
import {
  normalize, canon, altsOf, levenshtein, tolerance, isTypedCorrect, typedQuestion, buildChoices, chooseFormat,
  takeNext, requeue, initState, resolve, tick, isOver, makeItem, TYPED_MIN_BOX,
} from '../js/games/wordbank/logic.js';
import { DECKS, getDeck } from '../js/games/wordbank/decks.js';

const typed = (deck, entry, input) => isTypedCorrect(input, typedQuestion(deck, entry).targets);
const italian = getDeck('italian');
const finance = getDeck('finance');
const byId = (deck, id) => deck.entries.find((e) => e.id === id);

test('normalize: case, accents, punctuation, spacing', () => {
  assert.equal(normalize('  Caffè  '), 'caffe');
  assert.equal(normalize('PERCHÉ'), 'perche');
  assert.equal(normalize('I’m sorry!'), 'im sorry');
  assert.equal(normalize('Price-to-earnings'), 'price to earnings');
  assert.equal(normalize('p/e'), 'p e');
});

test('canon drops a leading article/“to”; altsOf splits on " / " and removes parentheticals', () => {
  assert.equal(canon('to eat'), 'eat');
  assert.equal(canon('The bill'), 'bill');
  assert.equal(canon('a little'), 'little');
  assert.equal(canon('to'), 'to');
  assert.deepEqual(altsOf('good morning / good day'), ['good morning', 'good day']);
  assert.deepEqual(altsOf('to know (a fact)'), ['know']);
});

test('levenshtein + tolerance', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('same', 'same'), 0);
  assert.deepEqual([2, 3, 4, 7, 8, 12].map(tolerance), [0, 0, 1, 1, 2, 2]);
});

test('typed recall (Italian → English): accent/case-insensitive, alternatives, typo tolerance', () => {
  const grazie = byId(italian, 'it-grazie');
  assert.ok(typed(italian, grazie, 'thank you'));
  assert.ok(typed(italian, grazie, 'THANK YOU'));
  assert.ok(typed(italian, grazie, '  Thank   You '));
  assert.ok(typed(italian, grazie, 'thnak you'), 'transposition within tolerance (2 edits at length 9)');
  assert.ok(!typed(italian, grazie, 'thanks a lot'));
  const parlare = byId(italian, 'it-parlare');
  assert.ok(typed(italian, parlare, 'to speak'));
  assert.ok(typed(italian, parlare, 'talk'));
  assert.ok(typed(italian, parlare, 'to talk'));
  assert.ok(typed(italian, byId(italian, 'it-sapere'), 'to know'));
  assert.ok(typed(italian, byId(italian, 'it-conto'), 'bill'));
  assert.ok(!typed(italian, byId(italian, 'it-conto'), ''));
});

test('short words get no typo tolerance', () => {
  const mai = byId(italian, 'it-mai'); // never (5)
  assert.ok(typed(italian, mai, 'never'));
  assert.ok(typed(italian, mai, 'nevar'));
  const ru = getDeck('russian');
  const da = byId(ru, 'ru-da');
  assert.ok(typed(ru, da, 'yes'));
  assert.ok(!typed(ru, da, 'yet'), '3-letter targets must match exactly');
});

test('typed recall (finance, reversed): definition → term, with abbreviations', () => {
  const pe = byId(finance, 'fn-pe');
  const q = typedQuestion(finance, pe);
  assert.equal(q.prompt, pe.back);
  assert.ok(typed(finance, pe, 'P/E'));
  assert.ok(typed(finance, pe, 'pe ratio'));
  assert.ok(typed(finance, pe, 'Price-to-earnings ratio'));
  assert.ok(typed(finance, byId(finance, 'fn-ebitda'), 'ebitda'));
  assert.ok(typed(finance, byId(finance, 'fn-ipo'), 'IPO'));
  assert.ok(typed(finance, byId(finance, 'fn-convexity'), 'convexty'), 'one missing letter');
  assert.ok(!typed(finance, byId(finance, 'fn-convexity'), 'duration'));
});

test('Russian prompt carries romanization hint', () => {
  const ru = getDeck('russian');
  assert.equal(typedQuestion(ru, byId(ru, 'ru-spasibo')).hint, 'spasibo');
});

test('MC: 4 options, exactly one correct, never an also-correct distractor (every entry, 3 seeds)', () => {
  for (const deck of DECKS) {
    for (const entry of deck.entries) {
      for (const seed of ['a', 'b', 'c']) {
        const { options, correctIndex } = buildChoices(deck, entry, createRng(`${deck.id}:${entry.id}:${seed}`));
        assert.equal(options.length, 4, `${entry.id}`);
        assert.equal(options.filter((o) => o.correct).length, 1);
        assert.equal(options[correctIndex].text, entry.back);
        const sets = options.map((o) => altsOf(o.text));
        const seen = new Set();
        for (const set of sets) {
          for (const a of set) {
            assert.ok(!seen.has(a), `${entry.id}: option alternative "${a}" appears twice`);
            seen.add(a);
          }
        }
        assert.equal(new Set(options.map((o) => normalize(o.text))).size, 4);
      }
    }
  }
});

test('MC distractors prefer the same tag', () => {
  const entry = byId(italian, 'it-caldo');
  let same = 0, total = 0;
  for (let i = 0; i < 100; i++) {
    for (const o of buildChoices(italian, entry, createRng(`t${i}`)).options.filter((x) => !x.correct)) {
      total++;
      if (italian.entries.find((e) => e.back === o.text).tag === entry.tag) same++;
    }
  }
  assert.ok(same / total > 0.5, `${same}/${total}`);
});

test('typed format only for box ≥ 3, about 30% of the time', () => {
  const rng = createRng('fmt');
  assert.equal(chooseFormat(undefined, rng), 'mc');
  assert.equal(chooseFormat({ box: TYPED_MIN_BOX - 1 }, rng), 'mc');
  let typedCount = 0;
  for (let i = 0; i < 4000; i++) if (chooseFormat({ box: 4 }, rng) === 'typed') typedCount++;
  assert.ok(typedCount > 1000 && typedCount < 1400, `${typedCount}`);
});

test('takeNext: due first, then new; never an immediate repeat; refills; falls back to practice', () => {
  const today = 100;
  const entries = italian.entries.slice(0, 12);
  const deck = { ...italian, entries };
  const cards = { [entries[0].id]: { box: 2, due: today - 1, lapses: 0, seen: 2 }, [entries[1].id]: { box: 1, due: today, lapses: 1, seen: 3 } };
  const rng = createRng('q');
  const queue = [];
  const first = takeNext({ queue, deck, cards, today, rng, lastId: null });
  assert.ok([entries[0].id, entries[1].id].includes(first.id), 'a due card comes first');
  // exhaust everything: all seen and not due → practice fallback, never the same id twice in a row
  const allSeen = Object.fromEntries(entries.map((e) => [e.id, { box: 3, due: today + 5, lapses: 0, seen: 3 }]));
  const q2 = [];
  let last = null;
  for (let i = 0; i < 40; i++) {
    const e = takeNext({ queue: q2, deck, cards: allSeen, today, rng, lastId: last });
    assert.notEqual(e.id, last);
    last = e.id;
  }
  // brand-new deck state: queue is prefilled by the caller; empty everything → still returns something
  assert.ok(takeNext({ queue: [], deck, cards: {}, today, rng, lastId: null }));
});

test('requeue reinserts a missed card a few turns ahead', () => {
  const q = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];
  requeue(q, { id: 'x' }, 3);
  assert.deepEqual(q.map((e) => e.id), ['a', 'b', 'c', 'x', 'd', 'e']);
  const short = [{ id: 'a' }];
  requeue(short, { id: 'x' });
  assert.deepEqual(short.map((e) => e.id), ['a', 'x']);
});

test('Rush scoring: +10 base, multiplier from streak before, +2s every 5th, −3s and reset on a miss', () => {
  let s = initState();
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const r = resolve(s, true);
    pts.push(r.points);
    s = r.state;
  }
  assert.deepEqual(pts, [10, 10, 10, 10, 10, 20, 20, 20, 20, 20, 30, 30]);
  assert.equal(s.timeLeftMs, 64000);
  const w = resolve(s, false);
  assert.equal(w.state.streak, 0);
  assert.equal(w.state.timeLeftMs, 61000);
  assert.equal(w.penaltyMs, 3000);
  assert.equal(resolve({ ...s, timeLeftMs: 1000 }, false).state.timeLeftMs, 0);
  assert.ok(isOver(tick(initState(), 60000)));
});

test('rating item: d = 800 + 100·box, skill from the deck', () => {
  assert.equal(makeItem({ deck: italian, card: undefined, correct: true, timeMs: 1, format: 'mc' }).difficulty, 900);
  const it = makeItem({ deck: finance, card: { box: 4 }, correct: false, timeMs: 5000, format: 'typed' });
  assert.equal(it.difficulty, 1200);
  assert.equal(it.skill, 'vocab_finance');
  assert.equal(it.targetMs, 9000);
});
