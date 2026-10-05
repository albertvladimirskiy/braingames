// WebAudio-synthesized SFX (no asset files). The context is created on the first user gesture.
let ctx = null;
let muted = false;

function tone({ freq, to = freq, dur = 0.12, type = 'sine', gain = 0.16, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SFX = {
  correct: () => tone({ freq: 620, to: 880, dur: 0.1 }),
  wrong: () => tone({ freq: 190, to: 110, dur: 0.24, type: 'sawtooth', gain: 0.13 }),
  streak: () => [523, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.12, delay: i * 0.07, type: 'triangle' })),
  levelup: () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.16, delay: i * 0.09, type: 'triangle' })),
  tick: () => tone({ freq: 1400, dur: 0.035, gain: 0.07, type: 'square' }),
  finish: () => [784, 659, 523, 392].forEach((f, i) => tone({ freq: f, dur: 0.2, delay: i * 0.1, type: 'sine' })),
};

export const audio = {
  setMuted(m) {
    muted = !!m;
  },
  /** Call from a user gesture (pointerdown/keydown). */
  unlock() {
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
      } catch {
        return;
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  },
  play(name) {
    if (muted || !ctx || ctx.state !== 'running') return;
    try {
      SFX[name]?.();
    } catch {
      /* audio is garnish: never break a game over it */
    }
  },
};
