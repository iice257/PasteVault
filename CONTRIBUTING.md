# Contributing to PasteVault

Thanks for helping. PasteVault is small and maintained by one person, so focused pull requests get reviewed fastest.

## Before you start

- **Bugs and ideas:** open an issue first so we can agree on the approach before you write code.
- **First contribution?** Look for issues labelled [`good first issue`](https://github.com/iice257/PasteVault/labels/good%20first%20issue).
- **Security problems:** please don't open a public issue. Report them privately through [GitHub security advisories](https://github.com/iice257/PasteVault/security/advisories/new).

## Run it locally

```bash
npm install
npm start          # http://localhost:4000
```

You don't need any accounts or keys. The dev server serves the `/api` functions with an in-memory store, so sync, pairing and files all work locally.

## Checks

CI runs these on every pull request. Run them before you push:

```bash
npm run verify           # lint, build, smoke, store, API, share, QR and file checks
```

If you touch the UI, also run the browser checks against a running dev server:

```bash
npm run functional:check
npm run mobile:check
npm run visual:check
npm run pair:check       # if you touch pairing or the QR scanner
npm run sync:check       # if you touch sync
```

## Ground rules

- **Encryption stays in the browser.** Nothing readable may reach the server: no plaintext, no passwords, no keys. If a change touches encryption, sync (`src/features/clipboard`) or the `/api` routes, say so in the pull request and explain why it's safe.
- **Keep the Content Security Policy tight.** Don't add third-party scripts, fonts or hosts. If a new host is truly needed, add only that host to `vercel.json` and explain why.
- **No new dependencies without a reason.** Mention in the pull request what the dependency does and why existing code can't do it.
- **Match the surrounding code.** Same naming, same formatting, comments only where the why isn't obvious.
- **Test what you change.** Extend the closest `tests/*-check.mjs` instead of adding a new framework.

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Keep each pull request to one change, with a short description of what changed and how you checked it.
3. Add screenshots for visual changes, at phone and desktop widths.
4. Add a line to `CHANGELOG.md` under an "Unreleased" heading if users will notice the change.

By contributing, you agree that your work is released under the [MIT license](LICENSE).
