// Debug-only plugin used to prove a game runs through the shell end to end (?debug).
import { createEmitter } from '../../core/events.js';
import { h } from '../../core/ui.js';

export default {
  id: 'dummy',
  name: 'Dummy (debug)',
  category: 'reasoning',
  skills: ['mental_arithmetic'],
  blurb: 'Tap the button 5 times. Exists only to test the shell.',
  durationSec: 10,
  create(ctx) {
    const em = createEmitter();
    const items = [];
    let started = 0;
    let last = 0;
    let btn;
    return {
      on: em.on,
      mount(el) {
        btn = h('button', {
          class: 'btn btn-primary btn-big', type: 'button', id: 'dummy-tap',
          onClick() {
            const t = performance.now();
            items.push({ skill: 'mental_arithmetic', difficulty: 1000, correct: true, timeMs: t - last, targetMs: 5000 });
            last = t;
            if (items.length >= 5) em.emit('finish', { gameId: 'dummy', mode: ctx.mode, score: items.length * 10, durationMs: t - started, items, stats: { seed: ctx.seed } });
          },
        }, 'Tap');
        el.append(btn);
      },
      start() {
        started = last = performance.now();
        btn.focus();
      },
      pause() {},
      destroy() {
        em.clear();
      },
    };
  },
};
