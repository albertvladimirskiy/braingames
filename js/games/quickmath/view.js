// Quick Math view: HUD, problem, answer entry (physical keyboard on desktop, in-app numpad on touch), juice.
import { h } from '../../core/ui.js';
import { createEmitter } from '../../core/events.js';
import { createLoop } from '../../core/loop.js';
import { query } from '../../config.js';
import { createHud } from '../hud.js';
import {
  initState, resolve, problemFor, tick, isOver, levelOf, itemDifficulty, targetMs,
  WRONG_PENALTY_MS, SKIP_PENALTY_MS,
} from './logic.js';

const MAX_DIGITS = 7;
const isTouch = () => query.has('numpad') || matchMedia('(hover: none) and (pointer: coarse)').matches;

export function createQuickMath(ctx) {
  const { rng, mode, seed, services } = ctx;
  const { audio, haptics, juice } = services;
  const em = createEmitter();
  const durationMs = (ctx.config?.durationSec ?? (mode === 'daily' ? 45 : 60)) * 1000;

  let state = initState({ mode, startLevel: ctx.startLevel, durationMs });
  let problem = null;
  let input = '';
  let running = false;
  let finished = false;
  let itemMs = 0; // active time spent on the current problem
  let activeMs = 0;
  let lastSec = -1;
  const items = [];
  const log = []; // [{ v: typed value | null for skip, t: ms }] lets the server replay a Daily

  let stage, hud, problemEl, answerEl, feedbackEl, flashLayer, levelEl;
  const loop = createLoop((dt) => {
    state = tick(state, dt);
    itemMs += dt;
    activeMs += dt;
    hud.setTime(state.timeLeftMs);
    const sec = Math.ceil(state.timeLeftMs / 1000);
    if (sec !== lastSec) {
      lastSec = sec;
      if (sec > 0 && sec <= 5) audio.play('tick');
    }
    if (isOver(state)) finish();
  });

  function nextProblem() {
    problem = problemFor(state, { rng, seed, prevText: problem?.text });
    input = '';
    itemMs = 0;
    problemEl.textContent = problem.text;
    levelEl.textContent = `Level ${levelOf(state)}`;
    renderAnswer();
  }

  function renderAnswer() {
    answerEl.textContent = input === '' ? '?' : input;
    answerEl.classList.toggle('empty', input === '');
  }

  function say(text, kind) {
    feedbackEl.textContent = text;
    feedbackEl.className = `feedback ${kind}`;
  }

  function answer(outcome) {
    const timeMs = itemMs;
    const solved = problem;
    log.push({ v: outcome === 'skip' ? null : Number(input), t: Math.round(timeMs) });
    const res = resolve(state, outcome);
    state = res.state;
    items.push({
      skill: solved.skill, difficulty: itemDifficulty(res.level), correct: outcome === 'correct',
      timeMs, targetMs: targetMs(res.level), level: res.level, kind: solved.kind, skipped: outcome === 'skip',
    });
    hud.setScore(state.score);
    hud.setStreak(state.streak);

    if (outcome === 'correct') {
      audio.play('correct');
      haptics.pulse('correct');
      juice.scorePop(stage, `+${res.points}`);
      say(`✓ Correct +${res.points}${res.multiplier > 1 ? ` (×${res.multiplier})` : ''}`, 'good');
      if (res.milestone) {
        juice.pulse(hud.meter);
        juice.scorePop(stage, '+2s', { kind: 'bonus' });
        audio.play('streak');
        haptics.pulse('streak');
      }
      if (res.levelChange > 0) {
        juice.scorePop(stage, `Level ${state.level}!`, { kind: 'bonus' });
        audio.play('levelup');
      }
    } else {
      audio.play('wrong');
      haptics.pulse('wrong');
      juice.shake(stage);
      juice.flash(flashLayer);
      juice.scorePop(stage, `−${(outcome === 'skip' ? SKIP_PENALTY_MS : WRONG_PENALTY_MS) / 1000}s`, { kind: 'bad' });
      say(`${outcome === 'skip' ? '↷ Skipped' : '✗ Wrong'}: ${solved.text} = ${solved.answer}`, 'bad');
    }
    hud.setTime(state.timeLeftMs);
    if (isOver(state)) return finish();
    nextProblem();
  }

  function submitCurrent() {
    if (!running || input === '') return;
    answer(Number(input) === problem.answer ? 'correct' : 'wrong');
  }

  function press(digit) {
    if (!running || input.length >= MAX_DIGITS) return;
    input = input === '0' ? digit : input + digit; // no leading zeros
    renderAnswer();
    if (Number(input) === problem.answer) answer('correct'); // exact answer auto-locks
  }

  function backspace() {
    if (!running) return;
    input = input.slice(0, -1);
    renderAnswer();
  }

  function onKey(e) {
    if (!running || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') backspace();
    else if (e.key === 'Enter') {
      if (e.target.closest?.('button')) return; // let a focused button handle its own Enter
      submitCurrent();
    } else if (e.key === 'Escape') answer('skip');
    else return;
    e.preventDefault();
  }

  function finish() {
    if (finished) return;
    finished = true;
    running = false;
    loop.stop();
    const attempts = state.correct + state.wrong + state.skipped;
    const good = items.filter((i) => i.correct);
    em.emit('finish', {
      gameId: 'quickmath', mode, score: state.score, durationMs: Math.round(activeMs), items,
      stats: {
        correct: state.correct, wrong: state.wrong, skipped: state.skipped,
        accuracy: attempts ? state.correct / attempts : 0,
        avgTimeMs: good.length ? good.reduce((a, i) => a + i.timeMs, 0) / good.length : 0,
        bestStreak: state.bestStreak, maxLevel: state.maxLevel, log,
      },
    });
  }

  function numpad() {
    const key = (label, fn, cls = '', aria) =>
      h('button', { type: 'button', class: `btn numkey ${cls}`, 'aria-label': aria ?? label, onClick: fn }, label);
    const digits = ['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((d) => key(d, () => press(d)));
    return h('div', { class: 'numpad' },
      digits,
      key('⌫', backspace, '', 'Backspace'),
      key('0', () => press('0')),
      key('Submit', submitCurrent, 'btn-primary numkey-submit'),
    );
  }

  return {
    on: em.on,
    mount(el) {
      stage = el;
      hud = createHud({ totalMs: durationMs });
      flashLayer = h('div', { class: 'flash-layer', 'aria-hidden': 'true' });
      levelEl = h('span', { class: 'chip qm-level' }, `Level ${levelOf(state)}`);
      problemEl = h('div', { class: 'qm-problem tabular', 'aria-live': 'polite', 'aria-atomic': 'true' }, '');
      answerEl = h('div', { class: 'qm-answer tabular empty', role: 'status', 'aria-label': 'Your answer' }, '?');
      feedbackEl = h('div', { class: 'feedback', role: 'status', 'aria-live': 'polite' }, '');
      const touch = isTouch();
      el.classList.add('stage-compact');
      el.append(
        flashLayer,
        hud.el,
        h('div', { class: 'qm-problem-wrap' }, levelEl, problemEl),
        h('div', { class: 'qm-answer-row' }, answerEl,
          h('button', { class: 'btn btn-sm', type: 'button', onClick: () => running && answer('skip') }, `Skip (−${SKIP_PENALTY_MS / 1000}s)${touch ? '' : ' · Esc'}`)),
        feedbackEl,
        touch ? numpad() : h('p', { class: 'muted center small' }, 'Type the answer: it locks in by itself. Enter submits a guess (−3s if wrong), Esc skips, P pauses.'),
      );
      document.addEventListener('keydown', onKey);
      hud.setTime(state.timeLeftMs);
      hud.setStreak(0);
      nextProblem();
    },
    start() {
      if (finished) return;
      running = true;
      loop.start();
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
