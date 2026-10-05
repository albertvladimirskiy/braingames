# Reps

Short mental-skill games (45–90 seconds each) that practice mental math, estimation, probability calibration, vocabulary and attention. Mobile-first, installable, fully playable offline. Vanilla HTML/CSS/JS with native ES modules: no framework, no bundler, no runtime dependencies, no network calls. (The product name is a working title; it lives in `js/config.js`.)

| Game | Category | Skill(s) |
| --- | --- | --- |
| Quick Math | quant | mental arithmetic, percentages |
| Ballpark | quant | estimation |
| How Sure Are You? | reasoning | calibration |
| Odds Check (stretch) | reasoning | calibration |
| Word Bank (finance, Italian, Russian) | language | vocab ×3 |
| Stroop | reflex | attention |

Plus a **Daily Challenge** (Quick Math 45 s → Ballpark ×5 → How Sure ×6, identical for everyone via a UTC-date seed, streaks with freezes, copyable result), per-skill Elo ratings, XP/levels, achievements, personal bests and a "ghost" comparison with your own recent average.

## Run

Needs Node ≥ 20 only for tests and tooling.

```bash
npm run serve        # npx --yes serve .   → open the printed URL
```

Any static server works (`python -m http.server`, etc.). Useful URL flags:

- `?debug` exposes `window.__reps` (storage, services, `patch(fn)`, clock override) and lists the dummy test game.
- `?seed=abc` makes content deterministic (per game and per replay).
- `?sw` registers the service worker on `localhost` (it is skipped there by default so you never debug stale caches).
- `?numpad` forces the on-screen numpad in Quick Math on desktop.
- Deep links: `#/play/quickmath?startLevel=3`, `#/play/wordbank?deck=italian`, `#/daily`, `#/stats`, `#/settings`.

## Test

```bash
npm test             # node:test, no dependencies (≈190 tests)
npm run check        # syntax-checks every .js/.mjs file
npm run gen          # regenerate the service-worker precache list/hash and mirror the app name
npm run smoke        # browser smoke test; needs Playwright, otherwise it skips with instructions
```

`npm run gen` must be run after editing any app file (a test fails when `sw.js` is stale; that is what keeps the offline cache honest).

## Deploy to GitHub Pages

All URLs are relative, so a project page under `https://<user>.github.io/<repo>/` works as is.

1. Push this folder to a GitHub repository (`main` branch).
2. Run `npm run gen` and commit the result if anything changed.
3. Either:
   - **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**, or
   - **Settings → Pages → Source: GitHub Actions**; the included workflow `.github/workflows/pages.yml` tests and publishes the folder on every push to `main`.
4. Open the published URL once while online; after that the app works offline and can be installed from the browser menu.

When you ship a change, bump `VERSION` in `js/config.js` **and** the `VERSION` constant in `sw.js`, run `npm run gen`, and deploy. Installed copies pick up the new cache automatically and old caches are deleted.

## Add a game

1. Create `js/games/<id>/` with `index.js` (manifest), `logic.js` (pure, takes an `rng`) and `view.js`.
2. Add one import line and one array entry in `js/games/registry.js`.

The shell, results screen, ratings, PBs, XP, achievements, home cards and stats pick it up automatically (Odds Check was added exactly this way). See `CLAUDE.md` for the contract.

## What is a placeholder

- Every benchmark number: rating tiers (Rookie < 900, Solid 900–1099, Sharp 1100–1299, Elite 1300+), per-game grade cutoffs (`js/core/benchmarks.js`) and the Daily segment normalisation maxima (`js/core/daily.js`). They are marked `// PLACEHOLDER: calibrate from real play data`, and the UI says so.
- Icons are simple generated SVG bars (`npm run icon`), not final artwork.
- The app name "Reps".

## Known limitations

- No server: the Daily is identical for everyone because the seed is the UTC date, but scores are not verified or compared across players, and a determined user can edit local storage (see `docs/BACKEND_PLAN.md`).
- Manifest icons are SVG only; Chromium installs fine, iOS "Add to Home Screen" would want PNG touch icons.
- Playwright is not part of the toolchain, so `npm run smoke` only runs where it is installed. Views were verified by hand in a real browser instead (see `docs/DECISIONS.md`).
- Audio and haptics depend on browser support (iOS Safari has no `navigator.vibrate`).
- Content is English-language and finite (120+ true/false statements, 60+ estimation items, 3 vocabulary decks of 60+ entries); sessions avoid recently seen items but long-term players will see repeats.
- This is a skill-practice game. It makes no claims about intelligence, health or "brain training" benefits.
