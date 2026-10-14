# Changelog

## v3.1.0 — encrypted files and images

**Files**
- Paste, attach or drop files into a clipboard. Each file is encrypted in the browser with its own AES-GCM key; the key and metadata live inside the already-encrypted clip, so the server only ever stores ciphertext.
- Up to 5 MB per file, 10 files and 25 MB per clipboard, kept for 7 days and then deleted. Storage is a private Supabase bucket reached through short-lived signed URLs, with atomic quota accounting and a daily sweep.
- The Tools panel shows how much of the clipboard's file allowance is used.

**Previews**
- Images (with thumbnails that sync inside the encrypted clip), video and audio, and PDF in the browser's own viewer.
- Text and code with a line-number gutter, language auto-detected from the first few lines or the file extension, a language override that is remembered, and a Formatted view (Markdown, pretty JSON, CSV table).
- Everything else gets a themed tile by file type; executables are labelled and never run.

**Fixes**
- Attaching a file while autosave ran could be reported as a conflict and delete the upload. Attachments now commit through the latest save.

**Security**
- CSP gains the Supabase host in `connect-src` and `blob:` for images, media and frames, and nothing else is loosened. Embedded Markdown is rendered with HTML disabled plus an allowlist sanitizer.

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
