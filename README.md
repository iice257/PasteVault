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

## Important Limits

This first version has no accounts. Clipboard ids isolate local browser workspaces, and protected clipboards encrypt their local payload before storage. Cross-device live sync still needs a small server or hosted realtime database.

Very large clips are supported locally, but should use export/import until backend storage is wired in.
