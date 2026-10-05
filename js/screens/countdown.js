// Live "resets in HH:MM:SS (at 02:00 local)" label. rAF-driven, writes only when the second changes.
import { h } from '../core/ui.js';
import { now } from '../core/clock.js';
import { nextReset } from '../core/daily.js';
import { formatCountdown } from '../core/format.js';

export function mountResetCountdown(parent, { onReset } = {}) {
  const el = h('span', { class: 'tabular' }, '');
  parent.append(el);
  let raf = 0;
  let last = '';
  let fired = false;
  const localTime = (at) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  (function frame() {
    const { ms, at } = nextReset(now());
    const text = `New Daily in ${formatCountdown(ms)} (${localTime(at)} your time, 00:00 UTC)`;
    if (text !== last) {
      last = text;
      el.textContent = text;
    }
    if (ms <= 0 && !fired) {
      fired = true;
      onReset?.();
    }
    raf = requestAnimationFrame(frame);
  })();
  return () => cancelAnimationFrame(raf);
}
