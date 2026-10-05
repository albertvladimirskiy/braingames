import { h } from '../../core/ui.js';
import { createWordBank } from './view.js';
import { DECKS } from './decks.js';
import { deckProgress, dayIndex } from '../../core/srs.js';
import { now } from '../../core/clock.js';

const progress = (services, deck, daysAhead = 0) =>
  deckProgress(deck.entries, services.storage.get().srs[deck.id] ?? {}, dayIndex(now()) + daysAhead);

export default {
  id: 'wordbank',
  name: 'Word Bank',
  category: 'language',
  skills: ['vocab_finance', 'vocab_italian', 'vocab_russian'],
  blurb: 'Rush through vocabulary with spaced repetition. Cards you miss come back sooner.',
  durationSec: 60,
  setup: (services) => ({
    key: 'deck',
    title: 'Choose a deck',
    choices: DECKS.map((d) => {
      const p = progress(services, d);
      return { value: d.id, label: d.name, sub: `${p.due} due · ${p.new} new · ${p.mastered} mastered` };
    }),
  }),
  create: createWordBank,
  renderResult(el, result, services) {
    const deck = DECKS.find((d) => d.id === result.stats.deck);
    const p = progress(services, deck);
    const tomorrow = progress(services, deck, 1);
    el.append(
      h('div', { class: 'card' },
        h('h2', null, `${deck.name} deck`),
        h('div', { class: 'kv' }, h('span', null, 'New'), h('strong', { class: 'tabular' }, p.new)),
        h('div', { class: 'kv' }, h('span', null, 'Learning'), h('strong', { class: 'tabular' }, p.learning)),
        h('div', { class: 'kv' }, h('span', null, 'Mastered (box 4+)'), h('strong', { class: 'tabular' }, p.mastered)),
        h('div', { class: 'kv' }, h('span', null, 'Due now'), h('strong', { class: 'tabular' }, p.due)),
        h('div', { class: 'kv' }, h('span', null, 'Due by tomorrow'), h('strong', { class: 'tabular' }, tomorrow.due)),
        h('p', { class: 'muted small' }, `Accuracy ${Math.round(result.stats.accuracy * 100)}% · best streak ${result.stats.bestStreak} · ${result.stats.newCards} new card${result.stats.newCards === 1 ? '' : 's'} seen`),
      ),
    );
  },
};
