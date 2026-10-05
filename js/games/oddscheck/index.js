import { h } from '../../core/ui.js';
import { createOddsCheck } from './view.js';

// Added to the app with only this folder + one line in registry.js (the plugin-contract proof).
export default {
  id: 'oddscheck',
  name: 'Odds Check',
  category: 'reasoning',
  skills: ['calibration'],
  blurb: 'Base-rate puzzles in plain counts: when a test says yes, how often is it right?',
  durationSec: 120,
  create: createOddsCheck,
  renderResult(el, result) {
    const missed = result.stats.missed;
    if (!missed.length) return;
    el.append(h('div', { class: 'card stack-sm' }, h('h2', null, 'Review your misses'), missed.map((m) => h('p', null, h('strong', null, `${m.text} `), h('span', { class: 'muted' }, m.explanation)))));
  },
};
