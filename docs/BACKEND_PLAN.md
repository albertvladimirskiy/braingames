# Backend

A zero-dependency reference backend now exists in `server/` (`npm run server`). It is optional: the static app never contacts a server until the player connects one in Settings. This document describes what it does, how the client links to it, and what it cannot protect against.

## Identity
Anonymous device id: the server issues `{ deviceId, token }` at `POST /v1/device`; the token is `<deviceId>.<HMAC-SHA256(secret, deviceId)>` sent as `Authorization: Bearer …`. No accounts and no email. To use the same identity on a second device, Settings shows a **link code** (`reps-link:` + base64url of the server URL, id and token); treat it like a password.

## Endpoints (JSON, CORS `*`)
| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/device` | register an anonymous device |
| GET | `/v1/state` | `{ version, state }`; `{ version: 0, state: null }` before the first upload (200, not 404, so a first sync is not a "failed request") |
| PUT | `/v1/state` | upload state; `If-Match: <version>` gives optimistic concurrency, 409 returns the server copy; the body is run through the same `migrate()`/`sanitize()` as the client and credentials are stripped |
| POST | `/v1/daily/{date}` | submit the **answer logs** `{ answers:{quickmath,ballpark,sure}, name? }` for today's UTC date (yesterday's is accepted for 10 minutes after the rollover). One submission per device per date (409 afterwards) |
| GET | `/v1/daily/{date}/leaderboard?limit=` | top totals plus the caller's rank; flagged runs are hidden |
| GET | `/v1/benchmarks` | percentile-based cutoffs, or `source: "placeholder"` until there are ≥ 5 players and ≥ 30 free-play runs per game |

Hardening: 1 MB body limit (413), 120 requests/minute per device (429), input validation with precise 4xx errors, timing-safe token comparison, `nosniff`, no file serving, no eval. Storage is a JSON file with atomic writes (`server/store.js`); swap it for a database if it grows.

## Client sync (`js/core/sync.js`, `js/core/merge.js`)
`createSync({ storage })` wraps the existing storage adapter: localStorage stays the source of truth and play never waits on the network. `syncNow()` = GET → `mergeStates(local, remote)` → PUT with `If-Match`, retrying once on 409. Background syncs are debounced (4 s) and only run when the state changed. Merge rules: more rated items wins per skill, best score wins, histories are unioned (deduplicated, capped), per-card SRS keeps the more-reviewed card, achievements keep the earlier unlock, the Daily streak follows the later `lastDate`, device settings (including credentials) never merge.

## Verified Daily
The Daily is a pure function of the date, so the server regenerates the exact content from the same logic modules the client uses (`dailySeed(date, game)` → `buildSet`/`problemFor`) and **replays** the submitted answers: Quick Math is re-simulated problem by problem with the real time accounting (penalties, +2 s bonuses, level ramp); Ballpark and Sure are re-scored from the estimates/confidences. The client never sends a score the server believes. A log is rejected if answers come after time expired, entries are malformed, or the date is wrong. Runs whose median answer time is implausibly fast are flagged and left off the board.

## Benchmark calibration
`server/benchmarks.js` (also used by `npm run calibrate` for exported backups) takes percentiles of real runs: Solid/Sharp/Elite = P40/P70/P90 of free-play scores per game, and P30/P65/P90 of ratings with ≥ 30 rated items for the tiers. The client applies them (`applyCalibration`), caches the last answer for offline use and changes its note from "placeholder" to "calibrated from N players". Games or tiers without enough data keep their placeholders.

## Anti-cheat caveats
The client is trusted code on a user-controlled machine. Replay verification removes forged totals and impossible timing, but a script that solves the questions at human speed is indistinguishable from a person, and a user who deletes their device id can start over. Treat the leaderboard as "for fun": no prizes, flagged runs hidden, and the server is the single place to remove abusers. Real anti-cheat (server-authoritative play) is out of scope for a client-side game.
