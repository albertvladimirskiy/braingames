// Odds Check view: natural-frequency base-rate question → four whole-percent options → grid explanation.
import { h, svg, fill } from '../../core/ui.js';
import { createEmitter } from '../../core/events.js';
import { createLoop } from '../../core/loop.js';
import { createHud } from '../hud.js';
import { buildProblem, buildOptions, pointsFor, sessionItems, QUESTIONS, QUESTION_MS } from './logic.js';

const NEXT_GUARD_MS = 350;
const COLS = 50;
const CELL = 6;

/** The explanation grid: one cell per person/part/etc., grouped so the counts are visible at a glance. */
export function populationGrid(p) {
  const rows = Math.ceil(p.n / COLS);
  const kinds = [['tp', p.tp], ['fn', p.fn], ['fp', p.fp], ['tn', p.tn]];
  const cells = [];
  let i = 0;
  for (const [kind, count] of kinds) {
    for (let c = 0; c < count; c++, i++) {
      cells.push(svg('rect', { x: (i % COLS) * CELL + 0.5, y: Math.floor(i / COLS) * CELL + 0.5, width: CELL - 1.5, height: CELL - 1.5, class: `cell cell-${kind}` }));
    }
  }
  return h('div', { class: 'stack-sm' },
    svg('svg', { viewBox: `0 0 ${COLS * CELL} ${rows * CELL}`, class: 'chart grid-chart', role: 'img', 'aria-label': `Grid of ${p.n} items: ${p.tp} real and flagged, ${p.fn} real but missed, ${p.fp} flagged by mistake, ${p.tn} fine and not flagged` }, cells),
    h('ul', { class: 'grid-legend' },
      h('li', null, h('i', { class: 'swatch swatch-tp' }), `${p.tp} real and flagged`),
      h('li', null, h('i', { class: 'swatch swatch-fn' }), `${p.fn} real but missed`),
      h('li', null, h('i', { class: 'swatch swatch-fp' }), `${p.fp} flagged by mistake`),
      h('li', null, h('i', { class: 'swatch swatch-tn' }), `${p.tn} fine and not flagged`)),
  );
}

export function createOddsCheck(ctx) {
  const { rng, mode, services } = ctx;
  const { audio, haptics, juice } = services;
  const em = createEmitter();
  const total = ctx.config?.questions ?? QUESTIONS;

  const questions = [];
  const seen = new Set();
  for (let guard = 0; questions.length < total && guard < 200; guard++) {
    const problem = buildProblem(rng);
    if (seen.has(problem.text)) continue;
    seen.add(problem.text);
    questions.push({ problem, ...buildOptions(problem, rng) });
  }

  let idx = 0;
  let phase = 'idle'; // idle | ask | feedback
  let running = false;
  let finished = false;
  let qMs = 0;
  let activeMs = 0;
  let score = 0;
  let feedbackAt = 0;
  const results = [];

  let stage, hud, flashLayer, progressEl, textEl, optionsEl, fbEl, nextBtn;
  const loop = createLoop((dt) => {
    qMs += dt;
    activeMs += dt;
    hud.setTime(Math.max(0, QUESTION_MS - qMs));
    if (qMs >= QUESTION_MS) answer(-1);
  });

  function show() {
    const q = questions[idx];
    phase = 'ask';
    qMs = 0;
    progressEl.textContent = `Question ${idx + 1} of ${total}`;
    textEl.textContent = q.problem.text;
    optionsEl.hidden = false;
    optionsEl.replaceChildren(...q.options.map((v, i) =>
      h('button', { class: 'btn wb-option', type: 'button', onClick: () => answer(i) }, h('kbd', { 'aria-hidden': 'true' }, String(i + 1)), h('span', { class: 'wb-option-text' }, `${v}%`))));
    fbEl.hidden = true;
    nextBtn.hidden = true;
    hud.setTime(QUESTION_MS);
    if (running) loop.start();
  }

  function answer(i) {
    if (phase !== 'ask' || !running) return;
    loop.stop();
    const q = questions[idx];
    const correct = i === q.correctIndex;
    const points = pointsFor(correct, qMs);
    score += points;
    results.push({ correct, timedOut: i < 0, points, timeMs: qMs, text: q.problem.text, explanation: q.problem.explanation, pct: q.problem.pct, chosen: i < 0 ? null : q.options[i] });
    hud.setScore(score);
    phase = 'feedback';
    feedbackAt = performance.now();
    audio.play(correct ? 'correct' : 'wrong');
    haptics.pulse(correct ? 'correct' : 'wrong');
    if (correct) juice.scorePop(stage, `+${points}`);
    else {
      juice.shake(stage);
      juice.flash(flashLayer);
    }
    [...optionsEl.children].forEach((b, k) => {
      b.disabled = true;
      if (k === q.correctIndex) {
        b.classList.add('wb-right');
        b.querySelector('.wb-option-text').prepend('✓ ');
      } else if (k === i) {
        b.classList.add('wb-wrong');
        b.querySelector('.wb-option-text').prepend('✗ ');
      }
    });
    const sens = `${q.sens}%`;
    fbEl.hidden = false;
    fill(fbEl,
      h('div', { class: `feedback ${correct ? 'good' : 'bad'}` }, i < 0 ? `⏱ Time's up. The answer is ${q.problem.pct}%.` : correct ? `✓ Right: ${q.problem.pct}% (+${points})` : `✗ The answer is ${q.problem.pct}%.`),
      h('p', null, q.problem.explanation),
      !correct && i >= 0 && h('p', { class: 'muted' }, q.options[i] === q.sens ? `${sens} is how often the test catches real cases, not how often a flag is real.` : 'Most flags come from the much larger group without the trait, even when false alarms are rare.'),
      populationGrid(q.problem),
    );
    nextBtn.textContent = idx === total - 1 ? 'See results' : 'Next';
    nextBtn.hidden = false;
    nextBtn.focus();
  }

  function next() {
    if (phase !== 'feedback' || !running) return;
    idx += 1;
    if (idx >= total) return finish();
    show();
  }

  function onKey(e) {
    if (!running || e.ctrlKey || e.metaKey || e.altKey) return;
    if (phase === 'ask' && /^[1-4]$/.test(e.key)) {
      answer(Number(e.key) - 1);
      e.preventDefault();
    } else if (phase === 'feedback' && (e.key === 'Enter' || e.key === ' ') && performance.now() - feedbackAt > NEXT_GUARD_MS && !e.target.closest?.('button')) {
      next();
      e.preventDefault();
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    running = false;
    loop.stop();
    const correct = results.filter((r) => r.correct).length;
    const items = [...results.map((r) => ({ skill: 'calibration', difficulty: 1100, correct: r.correct, noRating: true, timeMs: r.timeMs })), ...sessionItems(results)];
    em.emit('finish', {
      gameId: 'oddscheck', mode, score, durationMs: Math.round(activeMs), items,
      stats: { correct, answered: results.length, accuracy: results.length ? correct / results.length : 0, missed: results.filter((r) => !r.correct).map((r) => ({ text: r.text, explanation: r.explanation })) },
    });
  }

  return {
    on: em.on,
    mount(el) {
      stage = el;
      hud = createHud({ totalMs: QUESTION_MS, showStreak: false });
      flashLayer = h('div', { class: 'flash-layer', 'aria-hidden': 'true' });
      progressEl = h('div', { class: 'chip' }, '');
      textEl = h('p', { class: 'odds-text', 'aria-live': 'polite' }, '');
      optionsEl = h('div', { class: 'wb-options' });
      fbEl = h('div', { class: 'stack-sm', role: 'status', 'aria-live': 'polite', hidden: true });
      nextBtn = h('button', { class: 'btn btn-primary btn-big', type: 'button', hidden: true, onClick: next }, 'Next');
      el.append(flashLayer, hud.el, h('div', { class: 'row between' }, progressEl, h('span', { class: 'muted small' }, 'Keys 1–4')),
        h('div', { class: 'card stack-sm' }, textEl, optionsEl, fbEl), nextBtn);
      document.addEventListener('keydown', onKey);
      show();
    },
    start() {
      if (finished) return;
      running = true;
      if (phase === 'ask') loop.start();
      if (phase === 'feedback') nextBtn.focus();
    },
    pause() {
      running = false;
      loop.stop();
    },
    destroy() {
      running = false;
      loop.stop();
      document.removeEventListener('keydown', onKey);
      em.clear();
    },
  };
}
