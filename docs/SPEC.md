# PasteVault Spec

## Visual Thesis

Calm utility, immediate action, no fake productivity chrome. The composer, history, and selected clip are visible together on desktop and stacked cleanly on mobile.

## Primary Workspace

The app opens directly to a clipboard composer with Save, Paste, Copy latest, and Share draft controls. History is searchable, sortable, persistent, and detail actions are one tap away.

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

## MVP

- Durable local clipboard history.
- One-tap save, paste, copy latest, copy selected, share selected, and delete.
- Deduplication by exact text.
- Search, sort, pin, import, export.
- Installable/offline static app shell.

## Later

- Optional encrypted realtime rooms.
- QR codes for quick phone-to-laptop transfer.
- File/image clips.
- Browser extension capture.
- User-owned sync backend.
