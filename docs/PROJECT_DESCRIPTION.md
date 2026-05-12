# PasteVault Project Description

PasteVault is a fast, no-account clipboard for people who constantly move text between devices. It is built around a simple idea: paste once, open the link anywhere, and keep going.

The product replaces the awkward habit of messaging yourself on WhatsApp, Slack, email, or notes apps just to move a code snippet, URL, token, command, JSON object, or quick note from one device to another. A PasteVault clipboard is just a link with an id. Open that link on another browser and the same clipboard context is available there.

## What Makes It Different

PasteVault is intentionally not an account dashboard. There are no profiles, teams, inboxes, or feeds. The link is the workspace. The clipboard id decides the board, and an optional password decides whether the payload is locked.

The app is designed for speed first:

- paste or type content,
- save it,
- copy the link,
- open it elsewhere,
- copy the latest or selected item in one tap.

It also keeps a useful local history instead of treating clipboard transfers as disposable. Clips can be searched, sorted, pinned, starred, tagged, imported, exported, copied, deleted, and reopened later.

## Intended Users

PasteVault is especially useful for:

- developers moving commands, JSON, tokens, URLs, and snippets between machines,
- people switching between phone and laptop,
- anyone who wants a private temporary clipboard without signing in,
- users who need durable local history without a heavy notes app,
- workflows where sending messages to yourself feels silly or risky.

## Product Experience

The root page is a paste-first landing screen. It uses one visual background and keeps the entire first impression focused on the main action: paste something or enter a clipboard link.

Once content is pasted or a board is opened, the dashboard becomes a compact workspace. The editor is the center of gravity. History stays close. Details, metadata, tags, password state, and secondary actions are available without turning the page into a cluttered control panel.

On desktop, the app shows:

- left rail navigation,
- central editor,
- searchable history,
- right selected-clip details panel,
- top-level copy/theme/password controls.

On mobile, the app stacks the same workflow into a narrow, touch-friendly layout with editor first, compact history, details below, and a sticky composer/action area.

## Privacy And Security Model

PasteVault avoids accounts by design. Clipboard ids isolate boards. Password protection is optional and happens client-side with Web Crypto. Hosted sync only accepts encrypted payload records, so the API is not intended to receive plaintext clipboard content.

Unprotected hosted sync still encrypts data using the clipboard id as a link-derived key. Password-protected boards use a user password-derived key. This keeps the mental model simple: the link opens the board, and the password locks the board when extra privacy is needed.

## Storage Model

PasteVault works locally first. Browser localStorage keeps clip history durable on the current device. Hosted sync can be enabled on Vercel by configuring Upstash Redis REST or Vercel KV-compatible REST environment variables.

If hosted storage is not configured, the frontend still works as a local clipboard app. The API can fall back to per-function memory, but durable cross-device sync requires real hosted storage.

## Current Feature Set

- Link-based clipboard ids.
- No account requirement.
- Paste-first landing page.
- Dashboard editor with line numbers and format selection.
- Local unlimited-style history within browser storage limits.
- Search, sort, and type filtering.
- Pinning and starring.
- Tags.
- Copy selected clip.
- Copy latest clip.
- Copy clipboard link.
- Import and export.
- Optional password protection.
- Light and dark themes.
- Responsive desktop and mobile layouts.
- Encrypted hosted sync endpoint.
- Automated smoke, API, functional, interaction, visual, build, lint, and audit checks.

## Design Direction

The design direction is premium utility, not generic marketing. It uses strong whitespace, crisp borders, restrained elevation, clean typography, and glossy gradients only where they help key actions stand out.

The landing page should feel immediate and memorable. The dashboard should feel practical, dense enough for repeated use, and polished enough to trust with real snippets.

## Future Opportunities

Good next additions include QR code handoff, browser extension capture, richer conflict handling, file/image clips, public/private link controls, storage provisioning UI, and stronger abuse controls for hosted deployments.

The product should stay centered on the core promise: the fastest way to move pasteable content between devices without an account.
