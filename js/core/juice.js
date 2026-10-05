// Visual game-feel helpers. Everything is a no-op when motion is reduced; text/aria feedback in the
// views carries the information, so nothing here is required to understand what happened.
import { createRng, randomSeed } from './prng.js';

let reduced = false;
const fx = createRng(randomSeed()); // cosmetic randomness only; the codebase never calls Math.random

function restart(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // one-off reflow so the CSS animation can replay
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

export const juice = {
  setReduced(r) {
    reduced = !!r;
  },
  get reduced() {
    return reduced;
  },
  /** Floating "+40" that rises and fades inside `host` (position: relative). */
  scorePop(host, text, { kind = 'good' } = {}) {
    if (reduced || !host) return;
    const el = document.createElement('span');
    el.className = `pop pop-${kind}`;
    el.textContent = text;
    el.setAttribute('aria-hidden', 'true');
    el.style.left = `${35 + fx.next() * 30}%`;
    host.append(el);
    setTimeout(() => el.remove(), 1100);
  },
  shake(el) {
    if (!reduced && el) restart(el, 'fx-shake');
  },
  flash(el, kind = 'bad') {
    if (!reduced && el) restart(el, kind === 'bad' ? 'fx-flash-bad' : 'fx-flash-good');
  },
  pulse(el) {
    if (!reduced && el) restart(el, 'fx-pulse');
  },
  /** Lightweight canvas confetti for a new personal best. */
  confetti() {
    if (reduced) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'confetti';
    canvas.setAttribute('aria-hidden', 'true');
    const w = (canvas.width = innerWidth);
    const h = (canvas.height = innerHeight);
    document.body.append(canvas);
    const g = canvas.getContext('2d');
    const colors = ['#7F77DD', '#1D9E75', '#EF9F27', '#D85A30', '#ffffff'];
    const parts = Array.from({ length: 90 }, () => ({
      x: w / 2, y: h * 0.35,
      vx: (fx.next() - 0.5) * 14, vy: -fx.next() * 14 - 4,
      s: 4 + fx.next() * 6, c: fx.pick(colors), r: fx.next() * 6,
    }));
    const t0 = performance.now();
    (function frame(t) {
      const age = t - t0;
      g.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.vy += 0.35;
        p.x += p.vx;
        p.y += p.vy;
        p.r += 0.2;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.r);
        g.globalAlpha = Math.max(0, 1 - age / 1800);
        g.fillStyle = p.c;
        g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        g.restore();
      }
      if (age < 1800) requestAnimationFrame(frame);
      else canvas.remove();
    })(t0);
  },
};
