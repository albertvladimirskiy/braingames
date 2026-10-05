# Reps

Short mental-skill games (45–90 seconds each) that practice mental math, estimation, probability calibration, vocabulary and attention. Mobile-first, installable, fully playable offline. The app is vanilla HTML/CSS/JS with native ES modules: no framework, no bundler, no runtime dependencies, no network calls unless you opt in to the optional server. (The product name is a working title; it lives in `js/config.js`.)

| Game | Category | Skill(s) |
| --- | --- | --- |
| Quick Math | quant | mental arithmetic, percentages |
| Ballpark | quant | estimation |
| How Sure Are You? | reasoning | calibration |
| Odds Check (stretch) | reasoning | calibration |
| Word Bank (finance, Italian, Russian) | language | vocab ×3 |
| Stroop | reflex | attention |

Plus a **Daily Challenge** (Quick Math 45 s → Ballpark ×5 → How Sure ×6, identical for everyone via a UTC-date seed, streaks with freezes, copyable text and a shareable PNG), per-skill Elo ratings, XP/levels, achievements, personal bests, and a "ghost" comparison with your own 7-day average.

## Run

```bash
npm install          # dev tooling only (eslint, playwright); the app itself has zero dependencies
npm run serve        # npx --yes serve .   → open the printed URL
```

Any static server works. Useful URL flags: `?debug` (exposes `window.__reps`, lists the dummy test game), `?seed=abc` (deterministic content), `?sw` (register the service worker on localhost), `?numpad` (force the on-screen numpad). Deep links: `#/play/quickmath?startLevel=3`, `#/play/wordbank?deck=italian`, `#/daily`, `#/stats`, `#/settings`.

## Test and verify

```bash
npm run verify       # lint + syntax check + unit tests + browser end-to-end tests
npm test             # 224 unit tests (node:test, no dependencies)
npm run e2e          # 25 Playwright tests: every game played to its results screen, Daily, sync, offline, a11y, layout
npm run lint         # ESLint (also bans Math.random in app code)
npm run smoke        # quick browser smoke test (a few seconds per game)
npm run perf         # throttled load + frame-pacing profile
npm run gen          # regenerate the service-worker precache list/hash and mirror the app name
```

First time only: `npx playwright install chromium`. Run `npm run gen` after editing any app file (a test fails when `sw.js` is stale; that is what keeps the offline cache honest). See `docs/AUDIT.md` for the codebase audit and its findings.

## Deploy to GitHub Pages

All URLs are relative, so a project page under `https://<user>.github.io/<repo>/` works as is.

1. Push to a GitHub repository (`main`), run `npm run gen` first and commit the result.
2. **Settings → Pages → Source: GitHub Actions.** `.github/workflows/pages.yml` runs lint, unit and browser tests on every push/PR and, on `main`, publishes only the app files (`index.html`, `manifest.webmanifest`, `sw.js`, `css/ js/ data/ icons/`). Or choose "Deploy from a branch → main / (root)" and skip CI.
3. Open the published URL once while online; after that it works offline and can be installed from the browser menu.

When you ship a change, bump `VERSION` in `js/config.js` **and** in `sw.js`, run `npm run gen`, and deploy. Installed copies pick up the new cache automatically and old caches are deleted.

## Optional server (sync, verified leaderboard, calibrated benchmarks)

Off by default; the static app never contacts anything. `server/` is a zero-dependency Node reference backend:

```bash
npm run server                   # http://localhost:8787, data in server/data/store.json
```

In **Settings → Sync & leaderboard** enter the server URL and connect. You get an anonymous device id (no accounts, no email); progress syncs and merges across devices (use "Show link code" on one device and "Link this device" on another); each completed Daily is **re-computed by the server** from your answers and ranked on the day's leaderboard; and once enough players exist, the server publishes percentile-based tier/grade cutoffs that replace the placeholders. Details, endpoints and limits: `docs/BACKEND_PLAN.md`. To calibrate from exported backups without a server: `npm run calibrate -- backups/*.json`.

## Add a game

1. Create `js/games/<id>/` with `index.js` (manifest), `logic.js` (pure, takes an `rng`) and `view.js`.
2. Add one import line and one array entry in `js/games/registry.js`.

The shell, results screen, ratings, PBs, XP, achievements, home cards and stats pick it up automatically (Odds Check was added exactly this way). See `CLAUDE.md` for the contract.

## What is a placeholder

- Every benchmark number until a server (or `npm run calibrate`) has real data: rating tiers (Rookie < 900, Solid 900–1099, Sharp 1100–1299, Elite 1300+), per-game grade cutoffs (`js/core/benchmarks.js`), and the Daily segment normalisation maxima (`js/core/daily.js`). They are marked `// PLACEHOLDER: calibrate from real play data`, and the UI says so (and says "calibrated from N players" once that is true).
- The app name "Reps" and the generated icon artwork (bars in the four category colours).

## Known limitations

- Daily scores are verified by replaying your answers server-side (optional server only), but a bot that solves questions at human speed cannot be distinguished from a person. Without the server nothing is verified and local storage can be edited.
- Calibrated benchmarks need real data; none exists yet, so the shipped numbers are still placeholders.
- Audio and haptics depend on browser support (iOS Safari has no `navigator.vibrate`); not verified on physical devices or iOS.
- English-only, finite content (205 true/false statements, 69 estimation items, 3 vocabulary decks of 61–65 entries); sessions avoid recently seen items but long-term players will see repeats.
- The initial load fetches every game module (≈290 KB, one time; the service worker caches it). Lazy loading per game is the next optimisation.
- This is a skill-practice game. It makes no claims about intelligence, health or "brain training" benefits.
