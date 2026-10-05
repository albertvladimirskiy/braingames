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
After writing `data/tf-questions.js` (205 statements), `data/ballpark-bank.js` (69 items) and the three decks (65 finance, 65 Italian, 61 Russian), every entry was re-read in a separate pass against three questions: *am I certain this is true*, *is it time-stable*, *could the wording be read two ways*. Results of that pass:
- Kept only claims that are textbook-stable (dates of historical events, definitions, physical constants, geography that does not depend on politics). Dropped candidate items about populations, current officeholders, records and prices.
- Rewrote wording where a quantity had two common values: Sun diameter uses the IAU nominal radius (1,391,400 km), the Challenger Deep is given as ~10,900 km rather than a false-precision figure, the Eiffel Tower includes antennas, Australia’s note no longer compares it to a number I could not stand behind.
- Added ~34 false statements after the validators showed the first draft was 65% true; every false statement carries the correct fact in its explanation. Myth-style items (horned Vikings, Napoleon’s height, Salem burnings, flat-earth Middle Ages, 10% of the brain, Great Wall from the Moon) were kept only where mainstream scholarship is unambiguous.
- Vocabulary: no two entries in a deck share an accepted answer (enforced by `tests/decks.content.test.js`), so a multiple-choice distractor can never also be correct; Russian romanisation is a simple readable scheme, not a transliteration standard; finance definitions are one-sentence and mutually distinguishable (e.g. futures = standardized/exchange-traded vs forward = customized/OTC; contango vs backwardation stated as curve shapes).
- Automated guards: unique ids/texts, required fields, explanations present, 42–58% true overall, every topic ≥ 20 statements, ballpark `truth > 0`, ≥ 60 ballpark items spanning ≥ 20 orders of magnitude.
A tooling-free audit cannot prove correctness; if you spot an error, fix the entry and its test count will still hold.

## Verification actually performed
- `npm test` (190 tests) and `npm run check` pass; the service-worker logic (install/activate/offline fetch/stale cache cleanup) is exercised in `tests/sw.test.js` against a fake worker global.
- Playwright is not installed here, so `scripts/smoke.mjs` skips. Instead each game, the shell (countdown, pause, auto-pause on hidden tab, results, Again), Daily (all three segments, share text, persistence), Home, Stats and Settings (theme, motion, export → import round trip, invalid import) were driven in a real browser pane with scripted input, with no console errors, no horizontal overflow at 360 px, and no touch target under 48 px except checkbox inputs that sit inside a 48 px+ label.
- Not verified on real hardware: audio output, haptics, installation from the browser menu, iOS Safari.

## More decisions
- Odds Check rates the existing `calibration` skill (one summary item per session, K 40, d 1100); the spec fixes the skill list, and base-rate reasoning is the closest fit. It is not part of the Daily.
- Pause key is `P` (Esc is Quick Math's skip); `P` is ignored inside text inputs.
- The countdown overlay is opaque so the first problem cannot be read early.
- The 1,000-person grid in Odds Check explains each question; cell categories are distinguished by position/grouping, fill vs outline, and a legend with counts (never colour alone).
- Quick Math layout is deliberately compact (no separate level row) so the numpad fits above the fold at 360×640.
- `Daily` totals are the sum of three 0–333 segments, so the maximum is 999 (the spec says 0–1000).
- `html[data-theme]`/`data-motion` are resolved in JS (including the system preference) so CSS only needs one override block per theme.
- Gotcha recorded in CLAUDE.md: raw `replaceChildren(cond && node)` renders the text "false"; use `fill()`.

## Known limitations
See the README. In short: no server verification of Daily scores, SVG-only icons, Playwright smoke test not run here, English-only content, benchmark numbers are placeholders.
