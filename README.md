# PasteVault

A fast static clipboard for moving text, code, URLs, and JSON between browsers without sending messages to yourself.

## What It Does

- Saves unlimited local history in IndexedDB, bounded only by browser storage.
- Keeps clips until you delete them; share links do not expire.
- Copies the latest or selected clip in one tap.
- Reads from the system clipboard when the browser grants permission.
- Shares a selected clip or draft through a self-contained URL hash.
- Imports and exports full history as JSON.
- Runs offline after the first load through the service worker.

## Run

Open `index.html` directly in a browser, or run the included local server:

```powershell
npm start
```

Then open `http://localhost:4173`.

If `npm` is not available, use the bundled Codex Node runtime or any local Node install:

```powershell
node .\scripts\serve.mjs
```

```powershell
npm test
```

The local server uses PowerShell only. No package install is required.

## Important Limits

This first version has no backend account or cloud relay. Cross-device handoff works through generated share links, while full live sync would need a small server or a hosted realtime database.

Very large clips should use export/import because browsers and chat apps impose URL length limits on share links.
