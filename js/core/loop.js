// rAF game loop driven by performance.now() deltas (never setInterval drift).
// dt is clamped so a long stall (GC, tab switch) cannot swallow a whole round.
const MAX_DT = 100;

export function createLoop(onFrame) {
  let raf = 0;
  let last = 0;
  let running = false;
  function frame(t) {
    if (!running) return;
    const dt = Math.min(MAX_DT, Math.max(0, t - last));
    last = t;
    onFrame(dt);
    if (running) raf = requestAnimationFrame(frame);
  }
  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    get running() {
      return running;
    },
  };
}
