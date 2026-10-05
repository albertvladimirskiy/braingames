// Stroop view: tap the ink colour (or the word, after a rule flip). Buttons always carry the colour NAME as text.
import { h } from '../../core/ui.js';
import { createEmitter } from '../../core/events.js';
import { createLoop } from '../../core/loop.js';
import { createHud } from '../hud.js';
import {
  COLORS, DURATION_MS, WRONG_PENALTY_MS, BANNER_MS, initState, nextTrial, answer, tick, isOver, summarize,
} from './logic.js';

const RULE_TEXT = { ink: 'Tap the INK colour', word: 'Tap the WORD' };
const FLIP_TEXT = { ink: 'Rule flip: now tap the INK colour, not the word', word: 'Rule flip: now tap the WORD, not the ink' };

export function createStroop(ctx) {
  const { rng, services } = ctx;
  const { audio, haptics, juice } = services;
  const em = createEmitter();
  const durationMs = (ctx.config?.durationSec ?? DURATION_MS / 1000) * 1000;

  let state = initState(rng, { durationMs });
  let trial = null;
  let phase = 'idle'; // idle | banner | play
  let running = false;
  let finished = false;
  let waitMs = 0;
  let rtMs = 0;
  let activeMs = 0;
  let lastSec = -1;
  const items = [];

  let stage, hud, flashLayer, wordEl, ruleEl, bannerEl, feedbackEl, buttons;
  const loop = createLoop((dt) => {
    activeMs += dt;
    if (phase === 'banner') {
      waitMs -= dt; // the clock is paused while the rule-flip banner is read
      if (waitMs <= 0) showTrial();
      return;
    }
    state = tick(state, dt);
    rtMs += dt;
    hud.setTime(state.timeLeftMs);
    const sec = Math.ceil(state.timeLeftMs / 1000);
    if (sec !== lastSec) {
      lastSec = sec;
      if (sec > 0 && sec <= 5) audio.play('tick');
    }
    if (isOver(state)) finish();
  });

  function setRule(rule) {
    ruleEl.textContent = RULE_TEXT[rule];
    ruleEl.dataset.rule = rule;
  }

  function newTrial() {
    const r = nextTrial(state, rng);
    state = r.state;
    trial = r.trial;
    setRule(trial.rule);
    if (trial.kind === 'flip') {
      phase = 'banner';
      waitMs = BANNER_MS;
      bannerEl.textContent = FLIP_TEXT[trial.rule];
      bannerEl.hidden = false;
      wordEl.textContent = '';
      audio.play('streak');
      juice.pulse(ruleEl);
      for (const b of buttons) b.disabled = true;
    } else showTrial();
  }

  function showTrial() {
    phase = 'play';
    bannerEl.hidden = true;
    const word = COLORS.find((c) => c.id === trial.word);
    wordEl.textContent = word.name;
    wordEl.style.color = `var(--ink-${trial.ink})`;
    wordEl.dataset.ink = trial.ink; // test hook / debugging
    for (const b of buttons) b.disabled = false;
    rtMs = 0;
  }

  function tap(colorId) {
    if (!running || phase !== 'play') return;
    const r = answer(state, trial, colorId, rtMs);
    state = r.state;
    items.push(r.item);
    hud.setScore(state.score);
    hud.setStreak(state.streak);
    hud.setTime(state.timeLeftMs);
    if (r.correct) {
      audio.play('correct');
      haptics.pulse('correct');
      juice.scorePop(stage, `+${r.points}`);
      feedbackEl.textContent = `✓ +${r.points}${r.multiplier > 1 ? ` (×${r.multiplier})` : ''}`;
      feedbackEl.className = 'feedback good';
      if (r.milestone) {
        juice.pulse(hud.meter);
        audio.play('streak');
        haptics.pulse('streak');
      }
    } else {
      audio.play('wrong');
      haptics.pulse('wrong');
      juice.shake(stage);
      juice.flash(flashLayer);
      juice.scorePop(stage, `−${WRONG_PENALTY_MS / 1000}s`, { kind: 'bad' });
      const correct = COLORS.find((c) => c.id === trial.answer).name;
      feedbackEl.textContent = `✗ It was ${correct} (${trial.rule === 'ink' ? 'ink' : 'word'} rule)`;
      feedbackEl.className = 'feedback bad';
    }
    if (isOver(state)) return finish();
    newTrial();
  }

  function onKey(e) {
    if (!running || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const byKey = COLORS.find((c) => c.key === k) ?? COLORS[Number(k) - 1];
    if (byKey) {
      tap(byKey.id);
      e.preventDefault();
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    running = false;
    loop.stop();
    const s = summarize(state);
    em.emit('finish', {
      gameId: 'stroop', mode: ctx.mode, score: state.score, durationMs: Math.round(activeMs), items,
      stats: { ...s, correct: state.correct, wrong: state.wrong },
    });
  }

  return {
    on: em.on,
    mount(el) {
      stage = el;
      hud = createHud({ totalMs: durationMs });
      flashLayer = h('div', { class: 'flash-layer', 'aria-hidden': 'true' });
      ruleEl = h('div', { class: 'st-rule', role: 'status', 'aria-live': 'polite' }, RULE_TEXT.ink);
      bannerEl = h('div', { class: 'st-banner', role: 'alert', hidden: true }, '');
      wordEl = h('div', { class: 'st-word', 'aria-live': 'off' }, '');
      feedbackEl = h('div', { class: 'feedback', role: 'status', 'aria-live': 'off' }, '');
      buttons = COLORS.map((c, i) =>
        h('button', { class: 'btn st-btn', type: 'button', disabled: true, onClick: () => tap(c.id) },
          h('span', { class: 'st-swatch', style: { background: `var(--ink-${c.id})` }, 'aria-hidden': 'true' }),
          h('span', { class: 'st-name' }, c.name),
          h('kbd', { 'aria-hidden': 'true' }, String(i + 1))),
      );
      el.append(flashLayer, hud.el, ruleEl, bannerEl, h('div', { class: 'st-stage' }, wordEl), h('div', { class: 'st-grid' }, buttons), feedbackEl,
        h('p', { class: 'muted center small' }, 'Keys: 1–4 or R, B, G, Y. Wrong tap: −2s. Every ~10 trials the rule flips.'));
      document.addEventListener('keydown', onKey);
      hud.setTime(state.timeLeftMs);
      hud.setStreak(0);
      newTrial();
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
