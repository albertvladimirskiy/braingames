// Stats: skill ratings, 7-day XP sparkline, lifetime calibration, vocab progress, achievements, personal bests.
import { h, svg } from '../core/ui.js';
import { SKILLS, RATING } from '../config.js';
import { games } from '../games/registry.js';
import { DECKS } from '../games/wordbank/decks.js';
import { ACHIEVEMENTS } from '../core/achievements.js';
import { calibrationChart } from '../games/sure/chart.js';
import { calibrationSentence } from '../core/calibration.js';
import { ratingTier, TIERS, benchmarkNote } from '../core/benchmarks.js';
import { levelInfo } from '../core/scoring.js';
import { deckProgress, dayIndex } from '../core/srs.js';
import { utcDate, addDays } from '../core/daily.js';
import { now } from '../core/clock.js';
import { formatInt } from '../core/format.js';

const span = RATING.cap - RATING.floor;
const pct = (r) => `${(((r - RATING.floor) / span) * 100).toFixed(1)}%`;

function skillRows(st) {
  return Object.entries(SKILLS).map(([id, meta]) => {
    const e = st.ratings[id] ?? { r: RATING.start, n: 0 };
    const t = ratingTier(e.r);
    const game = games.find((g) => g.id === meta.gameId);
    return h('div', { class: 'skill-row', 'data-cat': game?.category },
      h('div', { class: 'row between' }, h('strong', null, meta.label), h('span', { class: 'tabular' }, `${formatInt(e.r)} · ${t.name}`)),
      h('div', { class: 'skill-bar', role: 'img', 'aria-label': `${meta.label} rating ${Math.round(e.r)}, tier ${t.name}` },
        h('span', { class: 'skill-fill', style: { width: pct(e.r) } }),
        TIERS.slice(1).map((tier) => h('i', { class: 'skill-tick', style: { left: pct(tier.min) }, title: `${tier.name} from ${tier.min}` }))),
      h('small', { class: 'muted' }, `${t.next ? `${t.toNext} pts from ${t.next}` : 'Top tier'} · ${e.n} rated item${e.n === 1 ? '' : 's'}`));
  });
}

function xpSparkline(st) {
  const today = utcDate(now());
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const xp = days.map((d) => st.history.filter((r) => utcDate(r.at) === d).reduce((a, r) => a + (r.xp ?? 0), 0));
  const max = Math.max(1, ...xp);
  const W = 300, H = 90, X0 = 14, X1 = W - 14;
  const px = (i) => X0 + (i / 6) * (X1 - X0);
  const py = (v) => H - 22 - (v / max) * (H - 40);
  const label = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' });
  return h('div', { class: 'stack-sm' },
    svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `XP per day over the last 7 days: ${xp.join(', ')}` },
      svg('polyline', { points: xp.map((v, i) => `${px(i)},${py(v)}`).join(' '), class: 'plot-line' }),
      xp.map((v, i) => [
        svg('circle', { cx: px(i), cy: py(v), r: 4, class: 'plot-dot' }),
        svg('text', { x: px(i), y: H - 6, class: 'plot-label', 'text-anchor': 'middle' }, label(days[i]).slice(0, 2)),
      ])),
    h('p', { class: 'muted small' }, `XP this week: ${formatInt(xp.reduce((a, b) => a + b, 0))} (best day ${formatInt(max === 1 && !xp.some(Boolean) ? 0 : max)}).`));
}

function deckRows(st) {
  const day = dayIndex(now());
  return DECKS.map((d) => {
    const p = deckProgress(d.entries, st.srs[d.id] ?? {}, day);
    const w = (n) => `${(n / p.total) * 100}%`;
    return h('div', { class: 'skill-row', 'data-cat': 'language' },
      h('div', { class: 'row between' }, h('strong', null, d.name), h('span', { class: 'tabular' }, `${p.due} due`)),
      h('div', { class: 'skill-bar stacked', role: 'img', 'aria-label': `${d.name}: ${p.mastered} mastered, ${p.learning} learning, ${p.new} new` },
        h('span', { class: 'seg seg-mastered', style: { width: w(p.mastered) } }), h('span', { class: 'seg seg-learning', style: { width: w(p.learning) } })),
      h('small', { class: 'muted' }, `${p.new} new · ${p.learning} learning · ${p.mastered} mastered`));
  });
}

export function renderStats(outlet, services) {
  const st = services.storage.get();
  const lv = levelInfo(st.xp);
  const calibN = st.calibration.buckets.reduce((a, b) => a + b.n, 0);
  outlet.append(
    h('div', { class: 'stack' },
      h('h1', null, 'Stats'),
      h('div', { class: 'card' },
        h('div', { class: 'kv' }, h('span', null, 'Reps level'), h('strong', { class: 'tabular' }, lv.level)),
        h('div', { class: 'kv' }, h('span', null, 'XP'), h('strong', { class: 'tabular' }, `${formatInt(lv.xp)} (${lv.into}/${lv.needed} to next)`)),
        h('div', { class: 'kv' }, h('span', null, 'Games played'), h('strong', { class: 'tabular' }, st.counters.runs))),
      h('section', { class: 'card stack-sm' }, h('h2', null, 'Skill ratings'), skillRows(st), h('p', { class: 'muted small' }, benchmarkNote())),
      h('section', { class: 'card stack-sm' }, h('h2', null, 'XP, last 7 days'), xpSparkline(st)),
      h('section', { class: 'card stack-sm' },
        h('h2', null, 'Lifetime calibration'),
        h('p', null, calibrationSentence(st.calibration.buckets)),
        calibN ? calibrationChart(st.calibration.buckets, { title: 'Lifetime' }) : h('p', { class: 'muted' }, 'Play How Sure Are You? to build your calibration chart.'),
        h('p', { class: 'muted small' }, `${calibN} answers recorded.`)),
      h('section', { class: 'card stack-sm' }, h('h2', null, 'Vocabulary'), deckRows(st)),
      h('section', { class: 'card stack-sm' }, h('h2', null, 'Personal bests'),
        games.map((g) => h('div', { class: 'kv' }, h('span', null, g.name), h('strong', { class: 'tabular' }, st.bests[g.id] ? formatInt(st.bests[g.id].score) : '–')))),
      h('section', { class: 'card stack-sm' }, h('h2', null, `Achievements (${Object.keys(st.achievements).length}/${ACHIEVEMENTS.length})`),
        ACHIEVEMENTS.map((a) => {
          const at = st.achievements[a.id];
          return h('div', { class: 'kv' },
            h('span', null, h('strong', null, `${at ? '✓' : '○'} ${a.name}`), h('br'), h('small', { class: 'muted' }, a.desc)),
            h('span', { class: 'muted small' }, at ? new Date(at).toLocaleDateString() : 'Locked'));
        })),
    ),
  );
}
