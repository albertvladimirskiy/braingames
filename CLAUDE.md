# CLAUDE.md

Architecture map and conventions for future sessions. Product name "Reps" lives ONLY in `js/config.js` (`npm run gen` mirrors it into `manifest.webmanifest` and the `<title>`).

## Commands
- `npm run verify` = lint + syntax + unit + e2e. Individually: `npm test` (node:test, glob `tests/**/*.test.js`) · `npm run e2e` (Playwright, `e2e/*.e2e.test.js`, fake clock) · `npm run lint` · `npm run check` · `npm run gen` (sw precache + name sync) · `npm run serve` · `npm run server` (optional backend) · `npm run perf` · `npm run calibrate -- <backups>`
- Run `npm run gen` after changing ANY file under `css/ js/ data/ icons/` or the root HTML/manifest, otherwise `tests/sw.test.js` fails (by design).
- E2E bots (`e2e/helpers.js`) run inside the page and look answers up in the shipped data files; they play at a human-ish pace on purpose (the +2 s streak bonus lets a <0.4 s/answer bot outlast the clock, and the server flags superhuman timings). Fixed fake clock: 2026-10-05T12:00:00Z.
- Browser testing: serve the folder, open `/?debug&seed=x#/play/<id>`. The in-app browser pane throttles `requestAnimationFrame` and reports `document.hidden`; when scripting it, shim rAF with `setTimeout` and keep the pane visible, or the shell's auto-pause kicks in.

## Layout
```
index.html  manifest.webmanifest  sw.js (generated block)  css/{tokens,base,components,games,game-views}.css
js/config.js            constants: APP_NAME, VERSION, SKILLS, RATING, query flags
js/main.js              wiring: storage → services → router
js/core/                PURE (no DOM): prng rating scoring srs benchmarks daily achievements calibration
                        progress recommend merge sync storage format clock events
                        DOM helpers: ui router loop audio haptics juice settings
js/games/<id>/          index.js (manifest) · logic.js (pure) · view.js (DOM)  + hud.js (shared HUD) registry.js
js/screens/             home gameShell results daily stats settings countdown leaderboard shareImage
server/                 OPTIONAL zero-dep backend: index (routes) auth store verify (Daily replay) benchmarks
e2e/                    Playwright end-to-end tests + helpers (bots, launcher)
data/                   tf-questions ballpark-bank decks/{finance,italian,russian}
tests/                  one file per core module / game logic / content / sw
scripts/                check gen-sw make-icon smoke
docs/                   DECISIONS.md BACKEND_PLAN.md
```

## Conventions
- **Logic is pure and takes an `rng`** (`createRng(seed)` from `core/prng.js`: mulberry32 + xmur3). Never call `Math.random`; `grep Math.random js` must only hit comments.
- Views only render and handle input. Timing is `createLoop` (rAF + `performance.now` deltas, dt clamped to 100 ms), never `setInterval`. Loops write one transform per frame and text only when the displayed second changes (no layout reads in the loop).
- Build DOM with `h()`/`svg()`/`fill()` from `core/ui.js`. Do NOT pass `cond && h(...)` to raw `el.replaceChildren(...)`/`append(...)` (it renders the text "false"); use `fill(el, …)` or put the conditional inside `h()`.
- Feedback is always text + icon, never colour alone. Accent colours are for fills/borders, not text. Touch targets ≥ 48 px. Honour `html[data-motion="reduced"]` (CSS) and `juice.reduced` (JS).
- Persist only through `services.storage` (`get()`, `update(fn)`); the schema is versioned (`SCHEMA_VERSION`, `MIGRATIONS` in `core/storage.js`). Changing the shape = bump the version + add a migration + test.
- Anything that turns a finished run into progress goes through `core/progress.js#finalizeRun`; do not duplicate that in views.

## Game plugin contract
`js/games/<id>/index.js` default-exports `{ id, name, category ('quant'|'language'|'reasoning'|'reflex'), skills:[skillId], blurb, durationSec, create(ctx) }` and optionally:
- `setup(services) → { key, title, choices:[{value,label,sub}] }`: a pre-game choice (Quick Math level, Word Bank deck); the result arrives as `ctx.options[key]`, `ctx.startLevel` for `startLevel`.
- `renderResult(el, result, services)`: extra results content (charts, review lists).

`create(ctx)` receives `{ rng, seed, mode ('free'|'daily'), services:{storage,rating,audio,haptics,juice}, startLevel, options, config }` and returns `{ on, mount(el), start(), pause(), destroy() }`. `start()` both begins and resumes. Stop your loop BEFORE emitting `finish`. Emit once: `em.emit('finish', { gameId, mode, score, durationMs, items:[{skill, difficulty, correct, timeMs, targetMs, s?, k?, noRating?}], stats })`.
Optional `stats` keys consumed generically: `seenIds` (recently seen content, avoid repeats), `calibration:[{q,correct}]` (lifetime calibration buckets). Achievement checks read `stats` (see `core/achievements.js`).
Daily-mode games must derive ALL content from `ctx.rng` up front (or from `seed + index`), never from player timing, so every player sees the same content.

## Where things live
- Ratings: `core/rating.js` (Elo, K 24→12 after 30 items, floor 400/cap 2400). Calibration-style games emit ONE summary item with explicit `s` and `k:40`, and flag per-question rows `noRating`.
- Benchmarks: ONLY in `core/benchmarks.js`, every number tagged `PLACEHOLDER`.
- Daily: `core/daily.js` (seed `daily:<UTC date>:<gameId>`, normalisation, streak/freeze logic) and `screens/daily.js` (flow, practice replays).
- SRS: `core/srs.js` (Leitner, days 0/1/3/7/14) + `games/wordbank/logic.js` (queue, matching, MC distractors).
- Content correctness is validated by `tests/content.test.js` and `tests/decks.content.test.js`; facts must be certain and time-stable.

## Optional server link
`core/sync.js` (client) talks to `server/` (reference backend); both reuse the pure logic modules (the server replays Daily answers with `games/*/logic.js`). Games record an answer `log` in `result.stats.log` (Quick Math `{v,t}`, Ballpark `{e,t}`, Sure `{c,p,t}`); keep that format in step with `server/verify.js` and its tests. Question sets come from each game's exported `buildSet(rng, count, exclude)`: use it in the view so client and server cannot diverge. Settings never merge or upload `settings.sync` (credentials).

## Gotchas
- **Line endings:** `.gitattributes` pins LF, and the SW hash normalises CR, but some editors/tools on Windows rewrite files as CRLF. Convert before committing if you see `CRLF will be replaced` warnings.
- `node --test tests/` is broken on Node 25; use the npm script.
- The service worker is cache-first; on localhost it is not registered unless `?sw`.
- `?seed=` seeds are `<seed>:<gameId>:<runCounter>` so "Again" gives new but reproducible content.
