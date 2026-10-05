// Builds an honest Daily answer log (what the client would send) for tests.
import { createRng } from '../../js/core/prng.js';
import { dailySeed } from '../../js/core/daily.js';
import { buildSet as ballparkSet } from '../../js/games/ballpark/logic.js';
import { buildSet as sureSet } from '../../js/games/sure/logic.js';
import { initState, problemFor, tick, resolve, isOver } from '../../js/games/quickmath/logic.js';

export function honestAnswers(date, { ms = 900 } = {}) {
  let s = initState({ mode: 'daily', durationMs: 45000 });
  const quickmath = [];
  while (quickmath.length < 400) {
    s = tick(s, ms);
    if (isOver(s)) break;
    quickmath.push({ v: problemFor(s, { seed: dailySeed(date, 'quickmath') }).answer, t: ms });
    s = resolve(s, 'correct').state;
  }
  const ballpark = ballparkSet(createRng(dailySeed(date, 'ballpark')), 5, []).map((q) => ({ e: q.truth, t: 6000 }));
  const sure = sureSet(createRng(dailySeed(date, 'sure')), 6, []).map((q) => ({ c: q.answer ? 'T' : 'F', p: 90, t: 4000 }));
  return { quickmath, ballpark, sure };
}
