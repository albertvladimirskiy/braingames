# Codebase audit

Scope: all of `js/`, `css/`, `data/`, `server/`, `sw.js`, tooling and tests. Method: ESLint (recommended rules + a `Math.random` ban), a dead-export scan (`npm run audit:exports`), `npm audit`, WCAG contrast computed from the real CSS tokens, a hand read of every screen and game view, pattern greps (`innerHTML`, `eval`, listeners, timers, direct storage access), then **real-browser** end-to-end runs (Playwright, fake clock) and a throttled performance profile. Every finding below was reproduced before it was fixed, and each fix has a test.

## Results at a glance
| Check | Result |
| --- | --- |
| `npm run lint` | 0 errors, 0 warnings |
| `npm audit` | 0 vulnerabilities (dev dependencies only; the shipped app has none) |
| Unsafe DOM APIs (`innerHTML`, `eval`, `document.write`) | none in `js/` or `server/` |
| Timers | no `setInterval` anywhere; game timing is rAF + `performance.now()` deltas |
| Listener hygiene | every document-level `addEventListener` has a matching `removeEventListener` on teardown |
| Unit tests | 224 (node:test) |
| End-to-end tests | 25 real-browser tests (every game played to its results screen, Daily, sync, offline, a11y, layout) |
| Cold load at 4× CPU throttle | FCP 128 ms, LCP 500 ms, CLS 0.004, 69 requests / 292 KB |
| Frame pacing in play at 4× throttle | p50 16.7 ms, p99 16.8 ms (60 fps) |

## Findings fixed
| # | Severity | Finding | How it was found | Fix |
| --- | --- | --- | --- | --- |
| 1 | High (a11y) | White text on the coral (reflex) primary button was **3.87 : 1**, below AA | new `tests/contrast.test.js` over `tokens.css` | `--on-reflex` is now the dark ink (5.0 : 1); test locks every pairing in both themes |
| 2 | High (a11y) | Stroop's yellow ink was **1.4 : 1** on the light theme, nearly invisible | same test | the word panel is always dark (`--stroop-bg`); all four inks ≥ 4.5 : 1 in both themes |
| 3 | High (robustness) | A corrupted, hand-edited or hostile saved/imported state (e.g. `history: "x"`) crashed the whole app on first render | read of `storage.js`, reproduced in e2e | `sanitize()` coerces every field, drops malformed records, runs on load/import/server upload; idempotent; tested with nasty inputs |
| 4 | Medium | Two open tabs overwrote each other's progress (each wrote its whole in-memory copy) | read of `storage.js` | `rev` counter; an update first adopts a newer saved revision; tested in unit and e2e |
| 5 | Medium (a11y) | The pause and countdown overlays left the game's buttons tabbable behind the dialog | read of `gameShell.js` | `inert` on the stage/top bar while an overlay is open; e2e asserts it |
| 6 | Medium (a11y) | Moving focus to `<main>` on every route, including first load, made the skip link unreachable | e2e keyboard-only test | focus is moved only after navigation, not on first load |
| 7 | Medium (a11y) | Home had no `<h1>` | e2e accessibility sweep over every route | brand is the `<h1>` |
| 8 | Medium | Skip link used a `#main` hash, which the hash router treated as a route change (fixed earlier in the first pass, kept covered by e2e) | code read | click handler focuses `<main>` |
| 9 | Medium (tooling) | The service-worker cache hash depended on line endings, so a CRLF checkout (Windows) and an LF checkout (CI) disagreed and the freshness test would fail in CI | noticed when editing on Windows (an editor rewrote files as CRLF) | hash is computed over LF-normalised text; `.gitattributes` pins `eol=lf` |
| 10 | Low | Malformed `%` escape in the URL hash made `decodeURIComponent` throw inside the router | read of `router.js` | safe decode; tested |
| 11 | Low | Keys like `__proto__`/`constructor` in saved or uploaded maps could reach merge code | read of `merge.js` | dropped in `sanitize`; tested |
| 12 | Low | A stale parse error stayed in the DOM after a valid Ballpark answer | e2e | cleared on lock-in |
| 13 | Low | A throwing `renderResult` would blank the whole results screen | read of `results.js` | guarded; the rest of the screen still renders |
| 14 | Low | `manifest` locked orientation to portrait (hurts tablets/desktop installs) | review | removed |
| 15 | Low | No Content-Security-Policy | review | strict CSP meta (`script-src 'self'`, no inline script, `object-src 'none'`); connect-src allows https and localhost for the optional server |
| 16 | Info | A new server route table returned 405 for `PUT /v1/state` (it matched the `GET` route first) | server HTTP tests | route matching checks path and method separately; tested |

## Accepted / not changed (with reasons)
- **Cold load pulls every game module** (69 requests, 292 KB). With the service worker it is a one-time cost, and LCP is already 500 ms at 4× throttle. The clean fix is lazy `import()` per game with manifests split from `create`; it is the first thing to do if the game count grows.
- **First sound creates the `AudioContext`** (≈250 ms spike under 4× throttle). It happens on the first user gesture on Home, never mid-round; only synthetic tests make it appear in-game.
- **Time bonus is bot-beatable by design**: +2 s per 5 correct means anything answering faster than ~0.4 s each never runs out of time. Humans cannot; the server flags superhuman Daily timings.
- **Switches under 48 px**: the checkbox inputs are 52×32, but each sits inside a full-width ≥ 48 px label that is the real tap target. The e2e check accounts for this explicitly.
- **Client trust**: scores are verified by the optional server (answers are replayed against the deterministic content), but a bot that solves questions at human speed cannot be told from a person. Documented in `docs/BACKEND_PLAN.md`.
- **Dead-export scan** lists 24 exported constants used only inside their own file (tunable knobs such as `LEVEL_UP_RUN`); they stay exported as documentation and for tests.

## How to re-run
```bash
npm run verify        # lint + syntax + unit + e2e
npm run perf          # throttled load + frame-pacing profile
npm run audit:exports # unused exports
npm audit
```
