// Results screen: score, grade, deltas vs last/PB/7-day "ghost", next goal, rating changes, XP, extras, Again.
import { h } from '../core/ui.js';
import { SKILLS, PLACEHOLDER_NOTE } from '../config.js';
import { ratingTier } from '../core/benchmarks.js';
import { formatInt, formatSigned } from '../core/format.js';

const GUARD_MS = 450; // ignore Enter/Space right after the round ends (a late answer keystroke must not restart it)

function deltaLine(label, delta, ref) {
  if (delta == null) return null;
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '＝';
  const cls = delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : 'muted';
  return h('div', { class: 'kv' }, h('span', null, label), h('span', { class: `tabular ${cls}` }, `${arrow} ${formatSigned(Math.round(delta))} (${formatInt(ref)})`));
}

export function renderResults(root, { game, result, summary, services, practice, onAgain, onHome }) {
  const shownAt = performance.now();
  const guarded = (fn) => () => performance.now() - shownAt >= GUARD_MS && fn();
  const { compare, grade } = summary;

  const nodes = [];
  nodes.push(
    h('div', { class: 'results-head' },
      h('h1', null, practice ? 'Practice complete' : 'Time!'),
      h('p', { class: 'muted' }, game.name),
      h('div', { class: 'big-num results-score', 'aria-label': `Score ${result.score}` }, formatInt(result.score)),
      h('div', { class: 'row wrap results-badges' },
        grade && h('span', { class: 'chip chip-grade' }, `Grade: ${grade.name}`),
        summary.isPb && h('span', { class: 'chip chip-pb' }, '★ New personal best'),
        practice && h('span', { class: 'chip' }, 'Practice — does not count'),
      ),
    ),
  );

  if (compare && (compare.last != null || compare.pb != null)) {
    nodes.push(
      h('div', { class: 'card' },
        h('h2', null, 'vs your history'),
        deltaLine('vs last run', compare.deltaLast, compare.last),
        deltaLine('vs personal best', compare.deltaPb, compare.pb),
        deltaLine('vs 7-day average', compare.deltaAvg, Math.round(compare.avg7 ?? 0)),
      ),
    );
  } else if (compare) {
    nodes.push(h('div', { class: 'card' }, h('p', null, 'First run recorded — this is your baseline. Beat it next time.')));
  }

  if (grade) {
    nodes.push(
      h('div', { class: 'card goal' },
        h('strong', null, 'Next goal'),
        h('p', { class: 'big-goal' }, grade.next ? `${formatInt(grade.toNext)} pts to ${grade.next}` : 'Top grade reached — chase your personal best.'),
      ),
    );
  }

  const skills = Object.entries(summary.ratingDeltas);
  if (skills.length) {
    nodes.push(
      h('div', { class: 'card' },
        h('h2', null, 'Skill ratings'),
        skills.map(([id, d]) => {
          const t = ratingTier(d.after);
          const diff = Math.round(d.after - d.before);
          return h('div', { class: 'kv' },
            h('span', null, SKILLS[id]?.label ?? id, h('br'), h('small', { class: 'muted' }, t.next ? `${t.name} · ${t.toNext} pts from ${t.next}` : `${t.name} · top tier`)),
            h('span', { class: `tabular ${diff >= 0 ? 'delta-up' : 'delta-down'}` }, `${formatInt(d.after)} (${formatSigned(diff)})`),
          );
        }),
        summary.tierChanges.map((c) => h('p', { class: 'tier-change' }, `★ ${SKILLS[c.skill]?.label ?? c.skill}: ${c.from} → ${c.to}`)),
      ),
    );
  }

  if (summary.level) {
    const lv = summary.level;
    nodes.push(
      h('div', { class: 'card' },
        h('div', { class: 'kv' }, h('span', null, `+${summary.xpGain} XP`), h('strong', null, `Reps level ${lv.level}`)),
        lv.after > lv.before && h('p', { class: 'tier-change' }, `★ Level up! You reached level ${lv.after}.`),
        h('div', { class: 'meter-bar', role: 'img', 'aria-label': `${lv.into} of ${lv.needed} XP to next level` }, h('span', { style: { width: `${Math.round((lv.into / lv.needed) * 100)}%` } })),
      ),
    );
  }

  if (summary.newAchievements.length) {
    nodes.push(
      h('div', { class: 'card' }, h('h2', null, 'Unlocked'), summary.newAchievements.map((a) => h('div', { class: 'kv' }, h('strong', null, a.name), h('span', { class: 'muted' }, a.desc)))),
    );
  }

  const extras = h('div', { class: 'stack' });
  game.renderResult?.(extras, result, services);
  nodes.push(extras);

  const again = h('button', { class: 'btn btn-primary btn-big', type: 'button', id: 'again', onClick: guarded(onAgain) }, 'Again');
  nodes.push(
    h('div', { class: 'stack-sm' }, again, h('button', { class: 'btn', type: 'button', onClick: onHome }, practice ? 'Back' : 'Home')),
    h('p', { class: 'muted small' }, PLACEHOLDER_NOTE, ' Enter or Space plays again.'),
  );

  root.replaceChildren(h('div', { class: 'stack results' }, nodes));

  const onKey = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest?.('button, a, input, select, textarea')) return; // native activation handles those
    e.preventDefault();
    guarded(onAgain)();
  };
  document.addEventListener('keydown', onKey);

  if (summary.isPb) services.juice.confetti();
  if (summary.level && summary.level.after > summary.level.before) {
    services.audio.play('levelup');
    services.haptics.pulse('levelup');
  } else if (summary.isPb) services.audio.play('levelup');
  return () => document.removeEventListener('keydown', onKey);
}
