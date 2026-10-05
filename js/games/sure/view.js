// How Sure Are You? view: statement → True/False → confidence → feedback.
import { h, fill } from '../../core/ui.js';
import { createEmitter } from '../../core/events.js';
import { createLoop } from '../../core/loop.js';
import { createHud } from '../hud.js';
import { formatSigned } from '../../core/format.js';
import { brierPoints } from '../../core/calibration.js';
import { buildSet, scoreQuestion, summarizeSession, FREE_QUESTIONS, DAILY_QUESTIONS, QUESTION_MS, CONF_SNAPS } from './logic.js';

const NEXT_GUARD_MS = 350;
const DEFAULT_CONF = 60;

export function createSure(ctx) {
  const { rng, mode, services, config } = ctx;
  const { audio, haptics, juice } = services;
  const em = createEmitter();
  const total = config?.questions ?? (mode === 'daily' ? DAILY_QUESTIONS : FREE_QUESTIONS);
  const exclude = mode === 'free' ? (services.storage.get().seen.sure ?? []) : [];
  const questions = buildSet(rng, total, exclude);

  let idx = 0;
  let phase = 'idle'; // idle | choose | confidence | feedback
  let running = false;
  let finished = false;
  let chosen = null;
  let qMs = 0;
  let activeMs = 0;
  let score = 0;
  let feedbackAt = 0;
  const answers = [];
  const log = []; // [{ c: 'T'|'F'|null, p: confidence, t: ms }] lets the server re-score a Daily

  let stage, hud, flashLayer, progressEl, statementEl, choosePanel, confPanel, fbPanel, nextBtn, slider, readout, previewEl, askLabel;
  const loop = createLoop((dt) => {
    qMs += dt;
    activeMs += dt;
    hud.setTime(Math.max(0, QUESTION_MS - qMs));
    if (qMs >= QUESTION_MS) timeout();
  });

  const conf = () => Number(slider.value);

  function showQuestion() {
    const q = questions[idx];
    phase = 'choose';
    chosen = null;
    qMs = 0;
    progressEl.textContent = `Question ${idx + 1} of ${total}`;
    statementEl.textContent = q.text;
    choosePanel.hidden = false;
    confPanel.hidden = true;
    fbPanel.hidden = true;
    nextBtn.hidden = true;
    setConf(DEFAULT_CONF);
    hud.setTime(QUESTION_MS);
    if (running) loop.start();
  }

  function pick(value) {
    if (phase !== 'choose' || !running) return;
    chosen = value;
    phase = 'confidence';
    choosePanel.hidden = true;
    confPanel.hidden = false;
    askLabel.textContent = `You chose ${value ? 'TRUE' : 'FALSE'}. How sure are you that it is ${value ? 'true' : 'false'}?`;
    slider.focus();
  }

  function setConf(v) {
    slider.value = String(v);
    readout.textContent = `${v}%`;
    previewEl.textContent = `If right: ${formatSigned(brierPoints(v / 100, true))}   ·   If wrong: ${formatSigned(brierPoints(v / 100, false))}`;
    for (const b of confPanel.querySelectorAll('[data-snap]')) b.setAttribute('aria-pressed', String(Number(b.dataset.snap) === v));
  }

  function record(entry) {
    log.push({ c: entry.chosen === null ? null : entry.chosen ? 'T' : 'F', p: entry.confidence, t: Math.round(qMs) });
    answers.push({ ...entry, id: questions[idx].id, tag: questions[idx].tag, timeMs: qMs });
    score += entry.points;
    hud.setScore(score);
  }

  function submit(confidence) {
    if (phase !== 'confidence' || !running) return;
    loop.stop();
    const q = questions[idx];
    const sc = scoreQuestion({ chosen, truth: q.answer, confidence });
    record({ chosen, truth: q.answer, confidence, correct: sc.correct, points: sc.points, timedOut: false });
    showFeedback(q, { ...sc, confidence, timedOut: false });
  }

  function timeout() {
    if (phase === 'confidence') return submit(50);
    if (phase !== 'choose') return;
    loop.stop();
    const q = questions[idx];
    record({ chosen: null, truth: q.answer, confidence: 50, correct: false, points: 0, timedOut: true });
    showFeedback(q, { correct: false, points: 0, confidence: 50, timedOut: true });
  }

  function showFeedback(q, sc) {
    phase = 'feedback';
    feedbackAt = performance.now();
    choosePanel.hidden = true;
    confPanel.hidden = true;
    fbPanel.hidden = false;
    const verdict = sc.timedOut
      ? "⏱ Time's up: 0 points"
      : sc.correct
        ? `✓ Right at ${sc.confidence}%: ${formatSigned(sc.points)}`
        : `✗ Wrong at ${sc.confidence}%: ${formatSigned(sc.points)}`;
    if (!sc.timedOut) {
      audio.play(sc.correct ? 'correct' : 'wrong');
      haptics.pulse(sc.correct ? 'correct' : 'wrong');
      juice.scorePop(stage, formatSigned(sc.points), { kind: sc.points > 0 ? 'good' : sc.points < 0 ? 'bad' : 'bonus' });
      if (!sc.correct && sc.confidence >= 70) {
        juice.shake(stage);
        juice.flash(flashLayer);
      }
    }
    fill(fbPanel,
      h('div', { class: `feedback ${sc.correct ? 'good' : 'bad'}` }, verdict),
      h('p', null, h('strong', null, `The statement is ${q.answer ? 'TRUE' : 'FALSE'}. `), q.explanation),
      !sc.correct && !sc.timedOut && sc.confidence >= 80 && h('p', { class: 'muted' }, 'Overconfidence is expensive by design: one confident miss wipes out several good answers.'),
    );
    nextBtn.textContent = idx === total - 1 ? 'See results' : 'Next';
    nextBtn.hidden = false;
    nextBtn.focus();
  }

  function next() {
    if (phase !== 'feedback' || !running) return;
    idx += 1;
    if (idx >= total) return finish();
    showQuestion();
  }

  function onKey(e) {
    if (!running || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (phase === 'choose' && (k === 't' || k === 'f')) pick(k === 't');
    else if (phase === 'confidence') {
      if (k === 'enter') submit(conf());
      else if (/^[5-9]$/.test(k)) setConf(Number(k) * 10);
      else if (k === '0') setConf(99);
      else return;
    } else if (phase === 'feedback' && (k === 'enter' || k === ' ') && performance.now() - feedbackAt > NEXT_GUARD_MS && !e.target.closest?.('button')) next();
    else return;
    e.preventDefault();
  }

  function finish() {
    if (finished) return;
    finished = true;
    running = false;
    loop.stop();
    const s = summarizeSession(answers);
    em.emit('finish', {
      gameId: 'sure', mode, score: s.score, durationMs: Math.round(activeMs), items: s.items,
      stats: {
        answered: s.answered, correct: s.correct, brier: s.brier, calibration: s.samples, log,
        accuracy: s.answered ? s.correct / s.answered : 0,
        seenIds: mode === 'free' ? answers.map((a) => a.id) : [],
        review: answers.filter((a) => !a.correct && !a.timedOut).map((a) => ({ id: a.id, confidence: a.confidence })),
      },
    });
  }

  return {
    on: em.on,
    mount(el) {
      stage = el;
      hud = createHud({ totalMs: QUESTION_MS, showStreak: false });
      flashLayer = h('div', { class: 'flash-layer', 'aria-hidden': 'true' });
      progressEl = h('div', { class: 'chip' }, '');
      statementEl = h('h2', { class: 'sure-statement', 'aria-live': 'polite' }, '');
      choosePanel = h('div', { class: 'stack-sm' },
        h('p', { class: 'muted' }, 'True or false? Then say how sure you are.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn-big grow', type: 'button', onClick: () => pick(true) }, 'True ', h('kbd', null, 'T')),
          h('button', { class: 'btn btn-big grow', type: 'button', onClick: () => pick(false) }, 'False ', h('kbd', null, 'F')),
        ),
      );
      askLabel = h('p', { class: 'strong', role: 'status', 'aria-live': 'polite' }, '');
      readout = h('output', { class: 'big-num sure-readout', for: 'sure-slider' }, `${DEFAULT_CONF}%`);
      slider = h('input', {
        type: 'range', id: 'sure-slider', min: '50', max: '99', step: '1', value: String(DEFAULT_CONF), class: 'sure-slider',
        'aria-label': 'Confidence in your answer, percent', onInput: (e) => setConf(Number(e.target.value)),
      });
      previewEl = h('p', { class: 'sure-preview tabular', 'aria-live': 'polite' }, '');
      confPanel = h('div', { class: 'stack-sm', hidden: true },
        askLabel, readout, slider,
        h('div', { class: 'snap-row' }, CONF_SNAPS.map((n) => h('button', { class: 'btn btn-sm', type: 'button', 'data-snap': n, 'aria-pressed': 'false', onClick: () => setConf(n) }, `${n}%`))),
        previewEl,
        h('button', { class: 'btn btn-primary btn-big', type: 'button', onClick: () => submit(conf()) }, 'Lock in ', h('kbd', null, 'Enter')),
        h('p', { class: 'muted small' }, 'Keys 5–9 set 50–90%, 0 sets 99%.'),
      );
      fbPanel = h('div', { class: 'stack-sm', role: 'status', 'aria-live': 'polite', hidden: true });
      nextBtn = h('button', { class: 'btn btn-primary btn-big', type: 'button', hidden: true, onClick: next }, 'Next');
      el.append(
        flashLayer, hud.el,
        h('div', { class: 'row between' }, progressEl, h('span', { class: 'muted small' }, '20 s per question')),
        h('p', { class: 'muted small' }, 'Scoring: right at 90% = +96, wrong at 90% = −224, and 50% is always 0. Overconfidence is expensive.'),
        h('div', { class: 'card stack-sm' }, statementEl, choosePanel, confPanel, fbPanel),
        nextBtn,
      );
      document.addEventListener('keydown', onKey);
      showQuestion();
    },
    start() {
      if (finished) return;
      running = true;
      if (phase === 'choose' || phase === 'confidence') loop.start();
      if (phase === 'confidence') slider.focus();
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
