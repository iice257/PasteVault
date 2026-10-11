# Changelog

## v3.0.0 — pairing and near-realtime sync

**Pair a device**
- New *Pair device* dialog with a locally generated QR code and a one-time 6-character code (10 minute expiry, no look-alike characters, single use).
- Join by typing the code or scanning a QR inside the app. Uses the native `BarcodeDetector` and falls back to a lazy-loaded `jsQR` decoder; typing always works.
- Entry points on the landing page (*Join with a code*), the header options menu, the mobile action row and the tools panel.
- New `POST /api/code` and `GET /api/code/:code`, rate limited, with codes redeemed atomically so they cannot be reused.

**Sync**
- Polling now sends the version the device already holds and the API replies `304 Not Modified`, so unchanged ciphertext is not re-downloaded.
- Devices catch up immediately on tab focus, visibility change and reconnect, and back off from 3s to 10s polling after 20 unchanged polls.
- Unread 404/304 response bodies are released so connections settle.

**Reliability**
- Storage failures are logged server-side with the real Upstash status and tagged with a reason (`unauthorized`, `rejected`, `timeout`, `unreachable`).
- New `GET /api/health` reports storage state without exposing connection details.
- The dev server now serves `/api/*`, using the in-memory store when Redis is not configured.

**Quality**
- New `pair:check` (full browser flow including camera start/stop and the legacy scanner path) and `qr:check` (generated QR codes decode with jsQR). API checks cover `304`, pairing, single use and rate limiting.
- Visual checks use an isolated clipboard per theme now that sync is real.
- `Permissions-Policy` allows the camera for this origin only.

## Before v3

Earlier work, summarised from the commit history (versions were not tagged):

- Showcase-first README with screenshots, MIT license.
- Stricter session state validation with explicit enums.
- Fixes for hosted share sync, mobile polish and a reworked dashboard workspace.
- Link-based clipboards with AES-256-GCM encryption, optional PBKDF2 password protection, import/export, history and an installable PWA.
