// End-of-game dot plot: each estimate positioned by log10(estimate ÷ truth) so the truth is the centre line.
import { svg, h } from '../../core/ui.js';
import { plotX, summarize, describeMiss, scoreAnswer } from './logic.js';
import { formatValue, formatInt } from '../../core/format.js';

const W = 320;
const ROW = 28;
const TOP = 26;
const X0 = 28;
const X1 = W - 26;
const xOf = (v) => X0 + ((v + 3) / 6) * (X1 - X0);
const TICKS = [[-3, '÷1000'], [-2, '÷100'], [-1, '÷10'], [0, 'truth'], [1, '×10'], [2, '×100'], [3, '×1000']];

export function dotPlot(answers) {
  const H = TOP + answers.length * ROW + 24;
  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Dot plot of your estimates relative to the true values, on a log scale' },
    TICKS.map(([v, label]) => [
      svg('line', { x1: xOf(v), x2: xOf(v), y1: TOP - 6, y2: H - 22, class: v === 0 ? 'plot-truth' : 'plot-grid' }),
      svg('text', { x: xOf(v), y: H - 8, class: 'plot-label', 'text-anchor': 'middle' }, label),
    ]),
    svg('text', { x: X0, y: 12, class: 'plot-label' }, '← too low'),
    svg('text', { x: X1, y: 12, class: 'plot-label', 'text-anchor': 'end' }, 'too high →'),
    answers.map((a, i) => {
      const y = TOP + i * ROW + ROW / 2;
      const x = xOf(plotX(a.estimate, a.truth));
      return svg('g', null,
        svg('title', null, `Question ${i + 1}: you said ${formatValue(a.estimate)}, truth ${formatValue(a.truth)} (${describeMiss(scoreAnswer(a))})`),
        svg('text', { x: 4, y: y + 4, class: 'plot-label' }, String(i + 1)),
        svg('line', { x1: X0, x2: X1, y1: y, y2: y, class: 'plot-row' }),
        svg('circle', { cx: x, cy: y, r: 7, class: 'plot-dot' }),
      );
    }),
  );

  const s = summarize(answers);
  return h('div', { class: 'card stack-sm' },
    h('h2', null, 'Your estimates'),
    h('p', null, s.n ? `Typical miss: ${s.typicalFactor < 10 ? s.typicalFactor.toFixed(1) : formatInt(s.typicalFactor)}x off the truth.` : ''),
    chart,
    h('ol', { class: 'answer-list' },
      answers.map((a) =>
        h('li', null, h('span', null, a.text), h('br'), h('small', { class: 'muted' }, `You: ${formatValue(a.estimate)} · Truth: ${formatValue(a.truth)}${a.unit ? ` ${a.unit}` : ''} · ${describeMiss(scoreAnswer(a))} · +${a.points}`)),
      ),
    ),
  );
}
