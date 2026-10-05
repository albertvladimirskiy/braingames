import { h } from '../../core/ui.js';
import { createSure } from './view.js';
import { calibrationChart } from './chart.js';
import { addSamples, emptyBuckets, calibrationSentence } from '../../core/calibration.js';
import { TF_QUESTIONS } from '../../../data/tf-questions.js';

export default {
  id: 'sure',
  name: 'How Sure Are You?',
  category: 'reasoning',
  skills: ['calibration'],
  blurb: 'True or false, then bet your confidence. Honest odds beat bravado.',
  durationSec: 120,
  create: createSure,
  renderResult(el, result) {
    const buckets = addSamples(emptyBuckets(), result.stats.calibration);
    const missed = result.stats.review.map((r) => ({ ...TF_QUESTIONS.find((q) => q.id === r.id), confidence: r.confidence })).filter((q) => q.id);
    el.append(
      h('div', { class: 'card stack-sm' },
        h('h2', null, 'Calibration'),
        h('p', null, `Brier score: ${result.stats.brier.toFixed(3)} (lower is better; always saying 50% scores 0.250).`),
        h('p', { class: 'strong' }, calibrationSentence(buckets)),
        calibrationChart(buckets, { title: 'This session' }),
      ),
      missed.length > 0 && h('div', { class: 'card stack-sm' },
        h('h2', null, 'Review your misses'),
        missed.map((q) => h('p', null, h('strong', null, `${q.text} `), h('span', { class: 'muted' }, `(you were ${q.confidence}% sure) ${q.explanation}`))),
      ),
    );
  },
};
