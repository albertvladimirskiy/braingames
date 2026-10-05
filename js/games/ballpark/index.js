import { createBallpark } from './view.js';
import { dotPlot } from './plot.js';

export default {
  id: 'ballpark',
  name: 'Ballpark',
  category: 'quant',
  skills: ['estimation'],
  blurb: 'Fermi-style estimates scored on a log scale. Get within the right order of magnitude.',
  durationSec: 90,
  create: createBallpark,
  renderResult(el, result) {
    el.append(dotPlot(result.stats.answers));
  },
};
