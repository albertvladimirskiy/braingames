# Decisions

Non-obvious calls made while building, so nobody has to reverse-engineer them.

## Tooling
- `npm test` runs `node --test "tests/**/*.test.js"`. The spec'd `node --test tests/` fails on Node 25 (a directory arg is resolved as a module), the glob works on every Node ≥ 21.
- The service worker precache list and a content hash live in a generated block of `sw.js` (`npm run gen`). A test fails when it is stale, so the cache name changes on every edit (no stale-shell bugs). The SW is not registered on `localhost` unless `?sw` is present, to avoid cache-first surprises while developing.
- Manifest icons are SVG only (`sizes: any`). Chromium installs with these; iOS home-screen icons would need PNGs (listed under known limitations).

## Architecture
- Games may export two optional extras beyond the contract: `setup(services)` (pre-game choice such as Quick Math starting level or Word Bank deck) and `renderResult(el, result)` (game-specific results charts). The shell remains generic.
- `progress.js#finalizeRun` is the single place where a finished GameResult turns into rating/PB/XP/history/achievement changes, so it is unit-tested without a DOM.
- Calibration samples (`result.stats.calibration`) and recently-seen content ids (`result.stats.seenIds`) are merged generically by `finalizeRun`, so new games get both for free.
- Daily practice replays (day already completed) skip rating, XP, history and streak writes entirely.

## Rules where the spec was ambiguous
- Quick Math: a skip counts as a "miss" for the 2-consecutive-misses level drop (as does a wrong submit). Level-up at the cap still resets the run counter.
- Quick Math daily: problem *i* is generated from `createRng(seed + ':' + i)`, so every player sees the same sequence regardless of speed.
- Stroop: "rule-flip trial" difficulty (1300) applies to the first trial after a rule change. No +2s streak time bonus (not in the spec).
- Word Bank: the clock pauses during the 1.2s wrong-answer reveal; the −3s penalty still applies. When due items and the 5-new cap are exhausted, the game falls back to "extra practice" over already-seen cards; correct answers on not-due cards do not move boxes, wrong answers still lapse.
- Word Bank finance deck is multiple-choice on definitions; typed recall is reversed for it (show definition, type the term) since typing definitions is impractical.
- Sure: a question that times out before choosing True/False scores 0 and is excluded from calibration; timing out after choosing submits at 50%.
- Ballpark speed bonus only applies when the answer earned points (stops mash-fast-garbage play).
- Daily: partial progress (finished segments) is persisted for the current UTC day; abandoning mid-segment loses only that segment. Daily scores are clamped to 0–333 per segment via fixed reference maxima (placeholders, see below).
- A missed day consumes a freeze only if there are enough freezes to cover *all* missed days; otherwise the streak resets and freezes are kept.

## Placeholders (must be calibrated with real play data)
- Rating tiers (Rookie < 900, Solid 900–1099, Sharp 1100–1299, Elite 1300+) and every per-game grade cutoff are in `js/core/benchmarks.js`, each marked `// PLACEHOLDER: calibrate from real play data`. The UI says so.
- Daily segment normalisation maxima (`SEGMENT_MAX` in `js/core/daily.js`) are placeholders as well.

## Content audit
(Recorded in phase 7 once the data files are written and re-read.)
