// Calibration chart: stated confidence (x) vs actual hit rate (y) per bucket, with the perfect-calibration diagonal.
import { svg, h } from '../../core/ui.js';
import { summarize } from '../../core/calibration.js';

const W = 320;
const H = 260;
const PAD = { l: 38, r: 14, t: 14, b: 34 };
const LO = 40; // axis range in percent
const HI = 100;
const x = (pct) => PAD.l + ((pct - LO) / (HI - LO)) * (W - PAD.l - PAD.r);
const y = (pct) => H - PAD.b - ((pct - LO) / (HI - LO)) * (H - PAD.t - PAD.b);
const TICKS = [50, 60, 70, 80, 90, 100];

/** buckets: lifetime/session bucket array from calibration.js. Returns a card element (chart + text table). */
export function calibrationChart(buckets, { title = 'Calibration' } = {}) {
  const rows = summarize(buckets);
  const pts = rows.filter((r) => r.n > 0).map((r) => ({ ...r, sx: Math.min(HI, r.stated * 100), sy: Math.max(LO, r.actual * 100) }));
  const maxN = Math.max(1, ...pts.map((p) => p.n));

  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `${title}: stated confidence versus how often you were right` },
    TICKS.map((t) => [
      svg('line', { x1: x(t), x2: x(t), y1: PAD.t, y2: H - PAD.b, class: 'plot-grid' }),
      svg('line', { x1: PAD.l, x2: W - PAD.r, y1: y(t), y2: y(t), class: 'plot-grid' }),
      svg('text', { x: x(t), y: H - PAD.b + 14, class: 'plot-label', 'text-anchor': 'middle' }, `${t}`),
      svg('text', { x: PAD.l - 6, y: y(t) + 3, class: 'plot-label', 'text-anchor': 'end' }, `${t}`),
    ]),
    svg('line', { x1: x(50), y1: y(50), x2: x(100), y2: y(100), class: 'plot-diagonal' }),
    svg('text', { x: x(75), y: H - 6, class: 'plot-label', 'text-anchor': 'middle' }, 'You said (confidence %)'),
    svg('text', { x: 10, y: y(70), class: 'plot-label', transform: `rotate(-90 10 ${y(70)})`, 'text-anchor': 'middle' }, 'Right (%)'),
    svg('text', { x: x(100), y: y(100) - 6, class: 'plot-label', 'text-anchor': 'end' }, 'perfect'),
    pts.length > 1 && svg('polyline', { points: pts.map((p) => `${x(p.sx)},${y(p.sy)}`).join(' '), class: 'plot-line' }),
    pts.map((p) =>
      svg('g', null,
        svg('title', null, `${p.label}%: you said ~${Math.round(p.stated * 100)}%, right ${Math.round(p.actual * 100)}% of the time (${p.n} answers)`),
        svg('circle', { cx: x(p.sx), cy: y(p.sy), r: 5 + 7 * (p.n / maxN), class: 'plot-dot' }),
      ),
    ),
  );

  return h('div', { class: 'stack-sm' },
    chart,
    h('table', { class: 'calib-table' },
      h('caption', { class: 'sr-only' }, `${title} by confidence bucket`),
      h('thead', null, h('tr', null, ['Bucket', 'Said', 'Right', 'Answers'].map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', null, rows.map((r) => h('tr', null,
        h('th', { scope: 'row' }, `${r.label}%`),
        h('td', { class: 'tabular' }, r.n ? `${Math.round(r.stated * 100)}%` : '–'),
        h('td', { class: 'tabular' }, r.n ? `${Math.round(r.actual * 100)}%` : '–'),
        h('td', { class: 'tabular' }, String(r.n)))))),
  );
}
