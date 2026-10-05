# Backend plan (design only, NOT implemented)

Goal: optional cloud sync and a per-day Daily leaderboard without accounts. The client stays fully functional offline.

## Identity
Anonymous device id: a random UUID created on first launch, stored in the app state (`state.deviceId`), sent as `X-Device-Id`. The server issues a signed token at `POST /v1/device` (body: nothing; response: `{ deviceId, token }`) and requires `Authorization: Bearer <token>` afterwards. Optional display name, never an email.

## Endpoints (REST, JSON)
| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/device` | register an anonymous device, returns token |
| GET | `/v1/state` | latest synced state blob + `version`/`updatedAt` |
| PUT | `/v1/state` | upload state; `If-Match: <version>` for optimistic concurrency, 409 returns the server copy |
| POST | `/v1/daily/{date}` | submit `{ scores:{quickmath,ballpark,sure}, total, clientSeedProof }` for a UTC date; first submission per device per date wins (409 afterwards) |
| GET | `/v1/daily/{date}/leaderboard?limit=50` | top totals + the caller's rank/percentile |
| GET | `/v1/benchmarks` | calibrated tier/grade cutoffs (replaces the placeholders in `benchmarks.js` once enough data exists) |

Dates are UTC `YYYY-MM-DD`; the server rejects dates other than "today ±1 minute of rollover".

## Swapping storage
`js/core/storage.js` already isolates persistence behind `createStorage(backend)` where `backend` is `{ getItem, setItem, removeItem }` (sync). A remote adapter would:
1. Keep localStorage as the write-through source of truth so play never waits on the network.
2. On `update()`, debounce and `PUT /v1/state` in the background; on load, `GET /v1/state` and merge. Merge rule: per-skill `n` decides ratings (higher wins), `history` is a union by `(gameId, at)`, `daily.results` is a union by date, `srs` takes the later `due`/higher `seen` per card, achievements union.
3. Expose the same sync `get()/update()` API to the app. Only `main.js` changes (`createStorage(syncedBackend(localStorage))`).

## Anti-cheat caveats
The client is trusted code on a user-controlled machine, so scores can be forged: they can edit local storage, replay the deterministic daily content in a script, or post fabricated totals. Mitigations that are cheap but not sufficient:
- The server recomputes plausibility: per-segment maxima, minimum time for the number of answers, and rate-limits submissions per device.
- Daily content is a pure function of the date, so the server can regenerate the exact questions and check submitted answers + timestamps (`answers:[{index, value, tMs}]`) instead of trusting totals. This catches fabricated totals but not a bot that solves the questions.
- Treat the leaderboard as "for fun": no prizes, show percentile bands rather than exact rank for suspicious outliers, and allow reporting/removal.
Real anti-cheat (server-authoritative play) is out of scope for a client-only game.
