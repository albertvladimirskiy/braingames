// Word Bank Rush view: SRS-driven multiple choice / typed recall on a 60s clock with streak feel.
import { h } from '../../core/ui.js';
import { createEmitter } from '../../core/events.js';
import { createLoop } from '../../core/loop.js';
import { createHud } from '../hud.js';
import { buildQueue, review, dayIndex } from '../../core/srs.js';
import { now } from '../../core/clock.js';
import { getDeck } from './decks.js';
import {
  RUSH_MS, REVEAL_MS, WRONG_PENALTY_MS, initState, tick, isOver, resolve, buildChoices, chooseFormat,
  typedQuestion, isTypedCorrect, takeNext, requeue, makeItem,
} from './logic.js';

const ADVANCE_MS = 180; // brief beat after a right answer so the tick registers

export function createWordBank(ctx) {
  const { rng, services, options } = ctx;
  const { audio, haptics, juice, storage } = services;
  const em = createEmitter();
  const deck = getDeck(options.deck) ?? getDeck('italian');
  const today = dayIndex(now());
  const cardsNow = () => storage.get().srs[deck.id] ?? {};

  let state = initState({ durationMs: RUSH_MS });
  const queue = buildQueue(deck.entries, cardsNow(), today, rng); // due first, then ≤5 new
  let phase = 'idle'; // idle | play | advance | reveal
  let running = false;
  let finished = false;
  let waitMs = 0; // remaining ADVANCE / REVEAL time
  let itemMs = 0;
  let activeMs = 0;
  let lastSec = -1;
  let lastId = null;
  let current = null; // { entry, card, format, mc?, typed? }
  const items = [];
  const newCards = new Set();

  let stage, hud, flashLayer, promptEl, hintEl, optionsEl, typedEl, inputEl, feedbackEl, tagEl;
  const loop = createLoop((dt) => {
    activeMs += dt;
    if (phase === 'reveal' || phase === 'advance') {
      waitMs -= dt;
      if (phase === 'advance') state = tick(state, dt); // the clock only pauses during the wrong-answer reveal
      hud.setTime(state.timeLeftMs);
      if (waitMs <= 0) return afterWait();
      if (phase === 'advance' && isOver(state)) return finish();
      return;
    }
    state = tick(state, dt);
    itemMs += dt;
    hud.setTime(state.timeLeftMs);
    const sec = Math.ceil(state.timeLeftMs / 1000);
    if (sec !== lastSec) {
      lastSec = sec;
      if (sec > 0 && sec <= 5) audio.play('tick');
    }
    if (isOver(state)) finish();
  });

  function present() {
    const entry = takeNext({ queue, deck, cards: cardsNow(), today, rng, lastId });
    const card = cardsNow()[entry.id];
    const format = chooseFormat(card, rng);
    current = { entry, card, format };
    lastId = entry.id;
    itemMs = 0;
    phase = 'play';
    tagEl.textContent = `${deck.name}${card ? ` · box ${card.box}` : ' · new'}`;
    feedbackEl.textContent = '';
    feedbackEl.className = 'feedback';
    optionsEl.replaceChildren();
    if (format === 'mc') {
      current.mc = buildChoices(deck, entry, rng);
      promptEl.textContent = entry.front;
      promptEl.classList.toggle('long', entry.front.length > 36);
      hintEl.textContent = entry.hint ?? '';
      typedEl.hidden = true;
      optionsEl.hidden = false;
      current.mc.options.forEach((o, i) =>
        optionsEl.append(
          h('button', { class: 'btn wb-option', type: 'button', 'data-index': i, onClick: () => chooseOption(i) },
            h('kbd', { 'aria-hidden': 'true' }, String(i + 1)), h('span', { class: 'wb-option-text' }, o.text)),
        ),
      );
    } else {
      current.typed = typedQuestion(deck, entry);
      promptEl.textContent = current.typed.prompt;
      promptEl.classList.toggle('long', current.typed.prompt.length > 36);
      hintEl.textContent = current.typed.hint ? `${current.typed.hint} · ${current.typed.instruction}` : current.typed.instruction;
      optionsEl.hidden = true;
      typedEl.hidden = false;
      inputEl.value = '';
      if (running) inputEl.focus();
    }
  }

  function chooseOption(i) {
    if (!running || phase !== 'play' || current.format !== 'mc') return;
    const correct = i === current.mc.correctIndex;
    for (const b of optionsEl.children) b.disabled = true;
    const picked = optionsEl.children[i];
    const right = optionsEl.children[current.mc.correctIndex];
    right.classList.add('wb-right');
    right.querySelector('.wb-option-text').prepend('✓ ');
    if (!correct) {
      picked.classList.add('wb-wrong');
      picked.querySelector('.wb-option-text').prepend('✗ ');
    }
    answered(correct, current.entry.back);
  }

  function submitTyped(giveUp = false) {
    if (!running || phase !== 'play' || current.format !== 'typed') return;
    const text = inputEl.value;
    if (!giveUp && text.trim() === '') return;
    const correct = !giveUp && isTypedCorrect(text, current.typed.targets);
    answered(correct, current.typed.answerText);
  }

  function answered(correct, answerText) {
    const { entry, card, format } = current;
    const t = now();
    const day = dayIndex(t);
    // SRS: due cards move normally; a not-due "extra practice" card only moves on a miss
    storage.update((st) => {
      const deckCards = (st.srs[deck.id] ??= {});
      const c = deckCards[entry.id];
      if (!c || c.due <= day || !correct) deckCards[entry.id] = review(c, correct, day);
    });
    if (!card) newCards.add(entry.id);
    items.push(makeItem({ deck, card, correct, timeMs: itemMs, format }));

    const res = resolve(state, correct);
    state = res.state;
    hud.setScore(state.score);
    hud.setStreak(state.streak);
    hud.setTime(state.timeLeftMs);

    if (correct) {
      audio.play('correct');
      haptics.pulse('correct');
      juice.scorePop(stage, `+${res.points}`);
      feedbackEl.textContent = `✓ Correct +${res.points}${res.multiplier > 1 ? ` (×${res.multiplier})` : ''}`;
      feedbackEl.className = 'feedback good';
      if (res.milestone) {
        juice.pulse(hud.meter);
        juice.scorePop(stage, '+2s', { kind: 'bonus' });
        audio.play('streak');
        haptics.pulse('streak');
      }
      phase = 'advance';
      waitMs = ADVANCE_MS;
    } else {
      audio.play('wrong');
      haptics.pulse('wrong');
      juice.shake(stage);
      juice.flash(flashLayer);
      juice.scorePop(stage, `−${WRONG_PENALTY_MS / 1000}s`, { kind: 'bad' });
      feedbackEl.textContent = `✗ Answer: ${answerText}`;
      feedbackEl.className = 'feedback bad';
      requeue(queue, entry);
      phase = 'reveal';
      waitMs = REVEAL_MS;
    }
  }

  function afterWait() {
    if (isOver(state)) return finish();
    present();
  }

  function onKey(e) {
    if (!running || e.ctrlKey || e.metaKey || e.altKey || phase !== 'play') return;
    if (current.format === 'mc' && /^[1-4]$/.test(e.key)) {
      chooseOption(Number(e.key) - 1);
      e.preventDefault();
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    running = false;
    loop.stop();
    const attempts = state.correct + state.wrong;
    em.emit('finish', {
      gameId: 'wordbank', mode: 'free', score: state.score, durationMs: Math.round(activeMs), items,
      stats: {
        deck: deck.id, correct: state.correct, wrong: state.wrong, accuracy: attempts ? state.correct / attempts : 0,
        bestStreak: state.bestStreak, newCards: newCards.size,
      },
    });
  }

  return {
    on: em.on,
    mount(el) {
      stage = el;
      hud = createHud({ totalMs: RUSH_MS });
      flashLayer = h('div', { class: 'flash-layer', 'aria-hidden': 'true' });
      tagEl = h('span', { class: 'chip chip-dot' }, deck.name);
      promptEl = h('div', { class: 'wb-prompt', 'aria-live': 'polite', lang: deck.id === 'russian' ? 'ru' : deck.id === 'italian' ? 'it' : 'en' }, '');
      hintEl = h('div', { class: 'wb-hint muted' }, '');
      optionsEl = h('div', { class: 'wb-options' });
      inputEl = h('input', {
        type: 'text', class: 'bp-input', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'Your answer',
        onKeydown: (e) => e.key === 'Enter' && (e.preventDefault(), submitTyped()),
      });
      typedEl = h('div', { class: 'stack-sm', hidden: true },
        h('div', { class: 'row' }, inputEl, h('button', { class: 'btn btn-primary', type: 'button', onClick: () => submitTyped() }, 'Check')),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onClick: () => submitTyped(true) }, 'I don’t know'),
      );
      feedbackEl = h('div', { class: 'feedback', role: 'status', 'aria-live': 'polite' }, '');
      el.append(flashLayer, hud.el, h('div', { class: 'row between' }, tagEl, h('span', { class: 'muted small' }, 'Wrong answer: −3s')),
        h('div', { class: 'wb-card' }, promptEl, hintEl), optionsEl, typedEl, feedbackEl);
      document.addEventListener('keydown', onKey);
      hud.setTime(state.timeLeftMs);
      hud.setStreak(0);
      present();
    },
    start() {
      if (finished) return;
      running = true;
      loop.start();
      if (phase === 'play' && current?.format === 'typed') inputEl.focus();
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
