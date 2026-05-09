# PasteVault Spec

## Visual Thesis

Calm utility, immediate action, no fake productivity chrome. The composer, history, and selected clip are visible together on desktop and stacked cleanly on mobile.

## Primary Workspace

The app opens directly to a clipboard composer with Save, Paste, Copy latest, and Copy link controls. History is searchable, sortable, persistent, and detail actions are one tap away.

## Interaction Thesis

Most choices sit in compact dropdowns or dropups: format, sort, export, import, and clearing history. The main path remains one click or one tap.

## Data Model

Clip:

- `id`
- `title`
- `text`
- `format`
- `source`
- `pinned`
- `createdAt`
- `updatedAt`
- `hits`

Persistence uses IndexedDB. Share links encode a single clip in the URL hash so the server never sees clipboard contents.

Clipboard:

- `id`
- `passwordHash` optional
- `createdAt`
- `updatedAt`
- `clips`

The product architecture is link-first: `/clip/:id` is the workspace context, and an optional password protects the clipboard when backend storage is connected. There are no accounts.

## MVP

- Durable local clipboard history.
- One-tap save, paste, copy latest, copy selected, copy link, and delete.
- Deduplication by exact text.
- Search, sort, pin, import, export.
- Responsive desktop and mobile clipboard workspace.

## Later

- Optional password-protected realtime clipboards.
- QR codes for quick phone-to-laptop transfer.
- File/image clips.
- Browser extension capture.
- User-owned sync backend.
