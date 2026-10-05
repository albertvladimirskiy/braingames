import { h } from '../../core/ui.js';
import { createStroop } from './view.js';

const ms = (x) => (x == null ? '–' : `${Math.round(x)} ms`);

export default {
  id: 'stroop',
  name: 'Stroop',
  category: 'reflex',
  skills: ['attention'],
  blurb: 'Tap the ink colour, not the word. Then the rule flips. Stay sharp under interference.',
  durationSec: 45,
  create: createStroop,
  renderResult(el, result) {
    const s = result.stats;
    el.append(
      h('div', { class: 'card' },
        h('h2', null, 'Attention'),
        h('div', { class: 'kv' }, h('span', null, 'Accuracy'), h('strong', { class: 'tabular' }, `${Math.round(s.accuracy * 100)}% (${s.correct}/${s.trials})`)),
        h('div', { class: 'kv' }, h('span', null, 'Mean RT, congruent'), h('strong', { class: 'tabular' }, ms(s.meanCongruentMs))),
        h('div', { class: 'kv' }, h('span', null, 'Mean RT, incongruent'), h('strong', { class: 'tabular' }, ms(s.meanIncongruentMs))),
        h('div', { class: 'kv' }, h('span', null, 'Stroop cost'), h('strong', { class: 'tabular' }, s.stroopCostMs == null ? '–' : `${s.stroopCostMs >= 0 ? '+' : '−'}${Math.abs(Math.round(s.stroopCostMs))} ms`)),
        h('div', { class: 'kv' }, h('span', null, 'Best streak'), h('strong', { class: 'tabular' }, s.bestStreak)),
        h('p', { class: 'muted small' }, 'Stroop cost is how much slower you are when ink and word disagree.'),
      ),
    );
  },
};
