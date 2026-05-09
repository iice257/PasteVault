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
- `pinned`
- `starred`
- `tags`
- `createdAt`
- `updatedAt`

Persistence uses localStorage namespaced by clipboard id. When a password is enabled, the payload is encrypted with Web Crypto AES-GCM using a PBKDF2-derived key before storage.

Clipboard:

- `id`
- `protection` optional password metadata
- `payload` plain data when unprotected
- `encryptedPayload` encrypted data when protected

The product architecture is link-first: `/clip/:id` is the workspace context. There are no accounts.

## MVP

- Durable local clipboard history.
- One-tap save, paste, copy latest, copy selected, copy link, and delete.
- Deduplication by exact text.
- Search, sort, pin, import, export.
- Optional password lock, unlock, and removal.
- Large local clip handling and encrypted-at-rest verification.
- Responsive desktop and mobile clipboard workspace.

## Later

- Hosted realtime clipboards behind the same `/clip/:id` model.
- QR codes for quick phone-to-laptop transfer.
- File/image clips.
- Browser extension capture.
- Server-side rate limiting, abuse controls, and cross-device storage.
