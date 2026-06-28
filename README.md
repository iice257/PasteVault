# PasteVault

A fast local-first clipboard for saving text, code, URLs, and JSON without sending messages to yourself. Cross-device sharing requires hosted storage.

## What It Does

- Uses a clipboard id in the URL as the primary workspace context.
- Opens at `/new` without creating an id; the first paste or valid import creates the clipboard.
- Starts every new clipboard empty, with no seeded demo clips.
- Keeps clips until you delete them; clipboard links do not expire by default.
- Supports optional password-protected local clipboards with encrypted stored payloads.
- Copies the latest or selected clip in one tap.
- Reads from the system clipboard when the browser grants permission.
- Shares a selected clip or draft through a clipboard link.
- Imports text/code files and PasteVault exports with per-file validation and partial-batch warnings.
- Exports full history as JSON.

## Run

Install dependencies and run Vite:

```powershell
npm install
npm start
```

Then open `http://localhost:4000`.

For port 1200, run:

```powershell
npm run start:1200
```

Then open `http://localhost:1200`.

```powershell
npm test
npm run functional:check
npm run visual:check
```

## Hosted Sync

PasteVault works locally without accounts. To enable cross-device encrypted blob sync on Vercel, configure either Upstash Redis REST or Vercel KV-compatible REST variables:

```powershell
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

or:

```powershell
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

The API only accepts encrypted clipboard payloads. Unprotected clipboards are encrypted with the clipboard link id; password-protected clipboards are encrypted with the user password before upload.

## Important Limits

This first version has no accounts. Clipboard ids isolate local browser workspaces, and protected clipboards encrypt their local payload before storage. Cross-device sync is available once the hosted KV/Redis REST environment variables are set.

Very large clips are supported locally. Hosted sync currently rejects encrypted payload requests above 1 MB to prevent abuse.
