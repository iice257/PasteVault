# PasteVault

A fast link-based clipboard for moving text, code, URLs, and JSON between browsers without sending messages to yourself.

## What It Does

- Uses a clipboard id in the URL as the primary workspace context.
- Keeps clips until you delete them; clipboard links do not expire by default.
- Supports an optional password architecture for protected clipboards.
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
```

## Important Limits

This first version has no accounts. Cross-device handoff is intended to work through clipboard ids and optional passwords, while full live sync needs a small server or hosted realtime database.

Very large clips should use export/import until backend storage is wired in.
