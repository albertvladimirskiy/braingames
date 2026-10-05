let enabled = true;
const PATTERNS = { correct: 8, wrong: [30, 40, 30], streak: [14, 28, 14], levelup: [20, 30, 20, 30, 40], finish: 60 };

export const haptics = {
  setEnabled(on) {
    enabled = !!on;
  },
  pulse(name) {
    if (!enabled || !PATTERNS[name]) return;
    try {
      navigator.vibrate?.(PATTERNS[name]);
    } catch {
      /* unsupported */
    }
  },
};
