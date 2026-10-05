// Deck validators: size, required fields, unique ids, and no ambiguous (overlapping) answers inside a deck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../js/games/wordbank/decks.js';
import { altsOf, canon } from '../js/games/wordbank/logic.js';

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

for (const deck of DECKS) {
  test(`${deck.id}: 50+ entries, required fields, unique ids`, () => {
    assert.ok(deck.entries.length >= 50, `only ${deck.entries.length}`);
    assert.ok(nonEmpty(deck.name) && nonEmpty(deck.skill));
    assert.ok(['forward', 'reverse'].includes(deck.typed));
    const ids = deck.entries.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate ids');
    for (const e of deck.entries) {
      assert.ok(nonEmpty(e.id) && nonEmpty(e.front) && nonEmpty(e.back) && nonEmpty(e.tag), e.id);
      assert.ok(e.id.startsWith({ finance: 'fn-', italian: 'it-', russian: 'ru-' }[deck.id]), e.id);
    }
  });

  test(`${deck.id}: no two entries share an accepted answer (so no distractor can be also-correct)`, () => {
    const owner = new Map();
    for (const e of deck.entries) {
      for (const a of altsOf(e.back)) {
        assert.ok(!owner.has(a), `"${a}" is an answer for both ${owner.get(a)} and ${e.id}`);
        owner.set(a, e.id);
      }
    }
    const fronts = new Map();
    for (const e of deck.entries) {
      for (const t of [e.front, ...(e.alt ?? [])].map(canon)) {
        assert.ok(!fronts.has(t) || fronts.get(t) === e.id, `typed target "${t}" ambiguous between ${fronts.get(t)} and ${e.id}`);
        fronts.set(t, e.id);
      }
    }
  });
}

test('russian: Cyrillic fronts with Latin romanization hints', () => {
  const ru = DECKS.find((d) => d.id === 'russian');
  for (const e of ru.entries) {
    assert.match(e.front, /[Ѐ-ӿ]/, e.id);
    assert.match(e.hint, /^[a-z' ]+$/, `${e.id} hint ${e.hint}`);
  }
});

test('italian: fronts are Italian-looking Latin text; finance: definitions are short enough for buttons', () => {
  const it = DECKS.find((d) => d.id === 'italian');
  for (const e of it.entries) assert.match(e.front, /^[a-zàèéìòù' ]+$/i, e.id);
  const fin = DECKS.find((d) => d.id === 'finance');
  for (const e of fin.entries) assert.ok(e.back.length <= 100, `${e.id} definition too long (${e.back.length})`);
});
