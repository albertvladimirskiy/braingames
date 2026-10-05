// Ballpark view: ask → feedback loop. A 25s soft timer only affects the speed bonus (never cuts you off).
import { h, fill } from '../../core/ui.js';
import { createEmitter } from '../../core/events.js';
import { createLoop } from '../../core/loop.js';
import { createHud } from '../hud.js';
import { formatValue } from '../../core/format.js';
import { BALLPARK_BANK } from '../../../data/ballpark-bank.js';
import { parseEstimate, scoreAnswer, describeMiss, pickQuestions, summarize, SOFT_MS, FREE_QUESTIONS, DAILY_QUESTIONS } from './logic.js';

const NEXT_GUARD_MS = 350; // the Enter that locked in an answer must not also skip its feedback

export function createBallpark(ctx) {
  const { rng, mode, services, config } = ctx;
  const { audio, haptics, juice } = services;
  const em = createEmitter();
  const total = config?.questions ?? (mode === 'daily' ? DAILY_QUESTIONS : FREE_QUESTIONS);
  const exclude = mode === 'free' ? (services.storage.get().seen.ballpark ?? []) : [];
  const questions = pickQuestions(rng, total, { bank: BALLPARK_BANK, exclude });

  let idx = 0;
  let phase = 'idle'; // idle | ask | feedback
  let running = false;
  let finished = false;
  let qMs = 0;
  let activeMs = 0;
  let score = 0;
  let feedbackAt = 0;
  const answers = [];
  const items = [];

  let stage, hud, flashLayer, progressEl, qText, unitEl, input, errorEl, askEl, fbEl, nextBtn, inputRow;
  const loop = createLoop((dt) => {
    qMs += dt;
    activeMs += dt;
    hud.setTime(Math.max(0, SOFT_MS - qMs));
  });

  function showQuestion() {
    const q = questions[idx];
    phase = 'ask';
    qMs = 0;
    progressEl.textContent = `Question ${idx + 1} of ${total}`;
    qText.textContent = q.text;
    unitEl.textContent = q.unit ? `Answer in ${q.unit}` : 'Answer as a plain number';
    input.value = '';
    input.removeAttribute('aria-invalid');
    errorEl.textContent = '';
    askEl.hidden = false;
    fbEl.hidden = true;
    hud.setTime(SOFT_MS);
    if (running) {
      loop.start();
      input.focus();
    }
  }

  function lockIn() {
    if (phase !== 'ask' || !running) return;
    const parsed = parseEstimate(input.value);
    if (!parsed.ok) {
      errorEl.textContent = parsed.error;
      input.setAttribute('aria-invalid', 'true');
      juice.shake(inputRow);
      return;
    }
    loop.stop();
    const q = questions[idx];
    const sc = scoreAnswer({ estimate: parsed.value, truth: q.truth, timeMs: qMs });
    score += sc.points;
    answers.push({ id: q.id, text: q.text, unit: q.unit, truth: q.truth, estimate: parsed.value, err: sc.err, points: sc.points, timeMs: qMs });
    items.push({ skill: 'estimation', difficulty: 800 + 100 * q.difficulty, correct: sc.err <= 0.5, s: sc.s, timeMs: qMs, targetMs: SOFT_MS });
    hud.setScore(score);
    showFeedback(q, parsed.value, sc);
  }

  function showFeedback(q, estimate, sc) {
    phase = 'feedback';
    feedbackAt = performance.now();
    const good = sc.points >= 60;
    audio.play(good ? 'correct' : 'wrong');
    haptics.pulse(good ? 'correct' : 'wrong');
    if (sc.close) {
      juice.pulse(hud.scoreEl);
      audio.play('streak');
    }
    if (sc.points < 30) {
      juice.shake(stage);
      juice.flash(flashLayer);
    }
    juice.scorePop(stage, `+${sc.points}`, { kind: good ? 'good' : 'bad' });
    askEl.hidden = true;
    fbEl.hidden = false;
    fill(fbEl,
      h('div', { class: `feedback ${good ? 'good' : 'bad'}` }, `${good ? '✓' : '✗'} ${describeMiss(sc)}`),
      h('div', { class: 'kv' }, h('span', null, 'Your estimate'), h('strong', { class: 'tabular' }, formatValue(estimate))),
      h('div', { class: 'kv' }, h('span', null, 'True value'), h('strong', { class: 'tabular' }, `${formatValue(q.truth)}${q.unit ? ` ${q.unit}` : ''}`)),
      h('div', { class: 'kv' }, h('span', null, 'Points'), h('strong', { class: 'tabular' }, `+${sc.points}`, h('small', { class: 'muted' }, ` (accuracy ${sc.base}${sc.close ? ` · within 10% +${sc.close}` : ''}${sc.speed ? ` · speed +${sc.speed}` : ''})`))),
      h('p', { class: 'muted' }, q.note),
    );
    nextBtn.textContent = idx === total - 1 ? 'See results' : 'Next question';
    nextBtn.hidden = false;
    nextBtn.focus();
  }

  function next() {
    if (phase !== 'feedback' || !running) return;
    nextBtn.hidden = true;
    idx += 1;
    if (idx >= total) return finish();
    showQuestion();
  }

  function onKey(e) {
    if (phase !== 'feedback' || !running || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.key === 'Enter' || e.key === ' ') && performance.now() - feedbackAt > NEXT_GUARD_MS && !e.target.closest?.('button')) {
      e.preventDefault();
      next();
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    running = false;
    loop.stop();
    const s = summarize(answers);
    em.emit('finish', {
      gameId: 'ballpark', mode, score, durationMs: Math.round(activeMs), items,
      stats: {
        answers, avgErrFactor: s.typicalFactor, questions: total,
        accuracy: answers.length ? answers.filter((a) => a.err <= 0.5).length / answers.length : 0,
        seenIds: mode === 'free' ? answers.filter((a) => a.id.startsWith('bp-')).map((a) => a.id) : [],
      },
    });
  }

  return {
    on: em.on,
    mount(el) {
      stage = el;
      hud = createHud({ totalMs: SOFT_MS, showStreak: false });
      flashLayer = h('div', { class: 'flash-layer', 'aria-hidden': 'true' });
      progressEl = h('div', { class: 'chip' }, '');
      qText = h('h2', { class: 'bp-question', 'aria-live': 'polite' }, '');
      unitEl = h('p', { class: 'muted' }, '');
      input = h('input', {
        type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false',
        class: 'bp-input tabular', 'aria-label': 'Your estimate', 'aria-describedby': 'bp-error',
        onKeydown: (e) => e.key === 'Enter' && (e.preventDefault(), lockIn()),
      });
      errorEl = h('p', { id: 'bp-error', class: 'feedback bad', role: 'status', 'aria-live': 'polite' }, '');
      inputRow = h('div', { class: 'row' }, input, h('button', { class: 'btn btn-primary', type: 'button', onClick: lockIn }, 'Lock in'));
      askEl = h('div', { class: 'stack-sm' }, qText, unitEl, inputRow, errorEl,
        h('p', { class: 'muted small' }, 'Accepts 1200, 1,200, 3.5k, 2m, 1.2b, 5e6 and fractions like 1/4. The timer only affects a small speed bonus. A close guess beats a perfect one that is slow.'));
      fbEl = h('div', { class: 'card stack-sm', role: 'status', 'aria-live': 'polite', hidden: true });
      nextBtn = h('button', { class: 'btn btn-primary btn-big', type: 'button', hidden: true, onClick: next }, 'Next question');
      el.append(flashLayer, hud.el, h('div', { class: 'row between' }, progressEl, h('span', { class: 'muted small' }, 'up to 135 pts each')), h('div', { class: 'card stack-sm' }, askEl, fbEl), nextBtn);
      document.addEventListener('keydown', onKey);
      showQuestion();
    },
    start() {
      if (finished) return;
      running = true;
      if (phase === 'ask') {
        loop.start();
        input.focus();
      } else if (phase === 'feedback') nextBtn.focus();
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
