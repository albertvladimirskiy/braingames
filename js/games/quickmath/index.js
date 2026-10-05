import { createQuickMath } from './view.js';

export default {
  id: 'quickmath',
  name: 'Quick Math',
  category: 'quant',
  skills: ['mental_arithmetic', 'percentages'],
  blurb: 'Race the clock: sums, tables, tips, discounts. Streaks multiply your score.',
  durationSec: 60,
  setup: () => ({
    key: 'startLevel',
    title: 'Starting level',
    choices: [
      { value: 1, label: 'Warm-up', sub: 'Level 1 · small adds and subtracts' },
      { value: 3, label: 'Standard', sub: 'Level 3 · times tables' },
      { value: 5, label: 'Hard', sub: 'Level 5 · percentages' },
    ],
  }),
  create: createQuickMath,
};
