# PasteVault

A fast link-based clipboard for moving text, code, URLs, and JSON between browsers without sending messages to yourself.

## What It Does

- Uses a clipboard id in the URL as the primary workspace context.
- Keeps clips until you delete them; clipboard links do not expire by default.
- Supports optional password-protected local clipboards with encrypted stored payloads.
- Copies the latest or selected clip in one tap.
- Reads from the system clipboard when the browser grants permission.
- Shares a selected clip or draft through a clipboard link.
- Imports and exports full history as JSON.

## Run

Install dependencies and run Vite:

```powershell
npm install
npm start
```

Then open `http://localhost:4173`.

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
