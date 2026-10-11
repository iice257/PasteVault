# Tasks

## Done

- Create static app shell.
- Add localStorage clip store namespaced by clipboard id.
- Add one-tap composer actions.
- Add searchable and sortable history.
- Add selected clip detail panel.
- Add copy-link oriented UI.
- Add optional password encryption with Web Crypto.
- Add Vercel encrypted blob sync API.
- Add CSP and baseline security headers.
- Add smoke test.
- Add visual and functional Playwright checks.

- v3: storage failure reasons in logs plus `GET /api/health`.
- v3: conditional polling (`304`), instant catch-up on focus and reconnect, idle backoff.
- v3: Pair device dialog with local QR, one-time 6-character codes, in-app camera scanner and typed fallback.
- v3: dev server serves `/api` locally so sync and pairing work without Redis.

## Next

- Provision a working Upstash Redis database for production and verify `/api/health` reports `ok`.
- Add conflict UI for simultaneous cross-device edits.
- Small client-side encrypted images and files (5-10 MB cap).
- Push-based sync (SSE or a realtime service) if polling latency becomes a problem.
