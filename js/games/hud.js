// Shared HUD for timed games: score, time bar, streak/multiplier meter.
// Per-frame work is limited to one transform write; text only changes when the displayed value does.
import { h } from '../core/ui.js';
import { formatTime } from '../core/format.js';
import { multiplier, clamp } from '../core/scoring.js';

export function createHud({ totalMs, showStreak = true }) {
  const scoreEl = h('span', { class: 'hud-score tabular' }, '0');
  const timeEl = h('span', { class: 'hud-time tabular' }, formatTime(totalMs));
  const fill = h('div', { class: 'timebar-fill' });
  const multEl = h('span', { class: 'meter-mult tabular' }, '×1');
  const streakEl = h('span', { class: 'meter-streak tabular' }, 'Streak 0');
  const pips = Array.from({ length: 5 }, () => h('i', { class: 'pip' }));
  const meter = h('div', { class: 'meter', 'data-mult': '1' }, multEl, h('span', { class: 'pips', 'aria-hidden': 'true' }, pips), streakEl);
  const timebar = h('div', { class: 'timebar', 'aria-hidden': 'true' }, fill);
  const el = h(
    'div',
    { class: 'hud' },
    h(
      'div',
      { class: 'hud-row' },
      h('div', { class: 'hud-block' }, h('span', { class: 'hud-label' }, 'Score'), scoreEl),
      h('div', { class: 'hud-block hud-right' }, h('span', { class: 'hud-label' }, 'Time'), timeEl),
    ),
    timebar,
    showStreak && meter,
  );

  let lastSec = -1;
  let lastScore = 0;
  return {
    el,
    meter,
    scoreEl,
    timebar,
    setScore(n) {
      if (n === lastScore) return;
      lastScore = n;
      scoreEl.textContent = String(n);
    },
    setTime(ms) {
      fill.style.transform = `scaleX(${clamp(ms / totalMs, 0, 1)})`;
      const sec = Math.max(0, Math.ceil(ms / 1000));
      if (sec !== lastSec) {
        lastSec = sec;
        timeEl.textContent = formatTime(ms);
        timebar.classList.toggle('low', sec <= 10);
        timebar.classList.toggle('critical', sec <= 5);
      }
    },
    setStreak(streak) {
      const mult = multiplier(streak);
      meter.dataset.mult = String(mult);
      multEl.textContent = `×${mult}`;
      streakEl.textContent = `Streak ${streak}`;
      const lit = streak >= 15 ? 5 : streak % 5;
      pips.forEach((p, i) => p.classList.toggle('on', i < lit));
    },
  };
}
