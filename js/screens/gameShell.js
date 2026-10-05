// Shared game shell: setup → countdown → play (pause overlay) → finalize → results / "Again".
// Games stay ignorant of all of this; they only implement the plugin contract.
import { h, announce, toast } from '../core/ui.js';
import { getGame } from '../games/registry.js';
import { createRng, randomSeed } from '../core/prng.js';
import { SEED_OVERRIDE } from '../config.js';
import { finalizeRun } from '../core/progress.js';
import { createLoop } from '../core/loop.js';
import { navigate } from '../core/router.js';
import { now } from '../core/clock.js';
import { renderResults } from './results.js';

let runCounter = 0;
const COUNT_STEP_MS = 700;

/**
 * @param opts.mode      'free' | 'daily'
 * @param opts.seed      fixed content seed (daily); otherwise random, or ?seed=… deterministic
 * @param opts.config    per-run overrides for the game, e.g. { durationSec, questions } for daily segments
 * @param opts.embedded  true → no results screen; onFinish(result, summary) is called instead
 * @param opts.practice  true → finalizeRun writes nothing (daily replay)
 * @returns cleanup function
 */
export function mountGame(outlet, opts) {
  const { services, gameId, mode = 'free', query = {}, seed = null, config = {}, practice = false, embedded = false, label = '', onFinish, onExit } = opts;
  const game = getGame(gameId);
  if (!game) {
    outlet.append(h('p', null, 'That game does not exist.'), h('a', { class: 'btn', href: '#/home' }, 'Home'));
    return;
  }
  document.body.classList.add('in-game');
  const root = h('div', { class: 'game-root', 'data-cat': game.category });
  outlet.append(root);
  const exit = onExit ?? (() => navigate('#/home'));

  let inst = null;
  let state = 'idle'; // idle | countdown | running | paused | done
  let countLoop = null;
  let pauseBtn = null;
  let lastOptions = {};
  let resultsCleanup = null;
  const runDisposers = [];
  const listen = (target, type, fn) => {
    target.addEventListener(type, fn);
    runDisposers.push(() => target.removeEventListener(type, fn));
  };

  function teardownRun() {
    resultsCleanup?.();
    resultsCleanup = null;
    countLoop?.stop();
    countLoop = null;
    for (const d of runDisposers.splice(0)) d();
    inst?.destroy();
    inst = null;
    state = 'idle';
  }

  function begin() {
    const setup = mode === 'free' && game.setup ? game.setup(services) : null;
    if (!setup) return run({});
    const preset = setup.choices.find((c) => String(c.value) === query[setup.key]);
    if (preset) return run({ [setup.key]: preset.value });
    showSetup(setup);
  }

  function showSetup(setup) {
    const last = services.storage.get().prefs[gameId];
    root.replaceChildren(
      h('div', { class: 'stack' },
        h('div', { class: 'row between' },
          h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onClick: exit }, '← Back'),
        ),
        h('h1', null, game.name),
        h('p', { class: 'muted' }, game.blurb),
        h('h2', null, setup.title),
        h('div', { class: 'stack-sm' },
          setup.choices.map((c) =>
            h('button', {
              class: `btn btn-big${c.value === last ? ' btn-primary' : ''}`, type: 'button',
              onClick() {
                services.storage.update((st) => (st.prefs[gameId] = c.value));
                run({ [setup.key]: c.value });
              },
            }, h('span', null, c.label), c.sub && h('small', { class: 'btn-sub' }, c.sub)),
          ),
        ),
      ),
    );
    root.querySelector('button.btn-big')?.focus();
  }

  function run(options) {
    teardownRun();
    lastOptions = options;
    runCounter++;
    const runSeed = seed ?? (SEED_OVERRIDE ? `${SEED_OVERRIDE}:${gameId}:${runCounter}` : randomSeed());
    pauseBtn = h('button', { class: 'btn btn-sm', type: 'button', onClick: togglePause }, 'Pause');
    const stage = h('div', { class: 'stage', role: 'region', 'aria-label': game.name });
    root.replaceChildren(
      h('div', { class: 'game-top' },
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onClick: exit }, '← Quit'),
        h('h1', { class: 'game-title' }, game.name, label && h('small', null, ` · ${label}`)),
        pauseBtn,
      ),
      stage,
    );
    inst = game.create({
      rng: createRng(runSeed), seed: runSeed, mode, services, config, options,
      startLevel: options.startLevel ?? 3,
    });
    inst.on('finish', onGameFinish);
    inst.mount(stage);
    listen(document, 'visibilitychange', () => document.hidden && state === 'running' && pause());
    listen(document, 'keydown', onKey);
    countdown();
  }

  // While an overlay is up, keep keyboard focus and screen readers out of the game behind it.
  const setInert = (on, selector) => root.querySelectorAll(selector).forEach((el) => (el.inert = on));

  function countdown() {
    state = 'countdown';
    setInert(true, '.stage');
    let shown = 3;
    const num = h('div', { class: 'countdown-num', 'aria-hidden': 'true' }, '3');
    const ov = h('div', { class: 'overlay opaque', role: 'status' }, h('p', { class: 'muted' }, 'Get ready'), num);
    root.append(ov);
    announce('3');
    services.audio.play('tick');
    let elapsed = 0;
    countLoop = createLoop((dt) => {
      elapsed += dt;
      const n = 3 - Math.floor(elapsed / COUNT_STEP_MS);
      if (n === shown) return;
      if (n <= 0) {
        countLoop.stop();
        ov.remove();
        setInert(false, '.stage');
        state = 'running';
        announce('Go');
        inst.start();
      } else {
        shown = n;
        num.textContent = String(n);
        announce(String(n));
        services.audio.play('tick');
      }
    });
    countLoop.start();
  }

  let pauseOverlay = null;
  function pause() {
    if (state !== 'running') return;
    inst.pause();
    state = 'paused';
    setInert(true, '.stage, .game-top');
    const resumeBtn = h('button', { class: 'btn btn-primary btn-big', type: 'button', onClick: resume }, 'Resume');
    pauseOverlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paused' },
      h('h2', null, 'Paused'),
      resumeBtn,
      h('button', { class: 'btn', type: 'button', onClick: exit }, 'Quit'),
    );
    root.append(pauseOverlay);
    pauseBtn.textContent = 'Resume';
    resumeBtn.focus();
  }
  function resume() {
    if (state !== 'paused') return;
    pauseOverlay?.remove();
    pauseOverlay = null;
    setInert(false, '.stage, .game-top');
    pauseBtn.textContent = 'Pause';
    state = 'running';
    inst.start();
  }
  function togglePause() {
    if (state === 'running') pause();
    else if (state === 'paused') resume();
  }
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target.tagName;
    if (e.key === 'Escape' && state === 'paused') return resume();
    if (e.key.toLowerCase() === 'p' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') togglePause();
  }

  function onGameFinish(result) {
    if (state === 'done') return;
    services.audio.play('finish');
    services.haptics.pulse('finish');
    let summary;
    services.storage.update((st) => (summary = finalizeRun(st, result, { practice, now: now() })));
    for (const a of summary.newAchievements) toast(a.desc, { title: `Unlocked: ${a.name}` });
    teardownRun();
    state = 'done';
    if (embedded) return onFinish?.(result, summary);
    resultsCleanup = renderResults(root, { game, result, summary, services, practice, onAgain: () => run(lastOptions), onHome: exit });
  }

  begin();
  return function dispose() {
    teardownRun();
    document.body.classList.remove('in-game');
    root.remove();
  };
}
