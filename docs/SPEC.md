# PasteVault Product Spec

## Product Summary

PasteVault is a no-account, link-based online clipboard for moving text, code, commands, JSON, notes, URLs, and other pasteable content between devices. A clipboard is identified by a URL-safe id, usually opened at `/clip/:id`. Users can paste once, open the generated link anywhere, optionally protect the clipboard with a password, and keep durable local history without sending messages to themselves.

## Primary Goals

- Make paste-to-share the fastest path through the product.
- Preserve user privacy by avoiding accounts and using link-based clipboard ids.
- Keep clip history durable locally with no default expiry.
- Support optional password protection using client-side Web Crypto encryption.
- Provide cross-device sync through the existing encrypted `/api/clip/:id` endpoint when hosted storage is configured.
- Keep desktop powerful while making mobile one-hand usable.

## Non-Goals

- User accounts, profiles, teams, or billing.
- Plaintext server-side clipboard storage.
- Social sharing feeds or collaboration comments.
- File/image storage as a core v1 capability.
- Server-side search over clipboard content.

## Routing

- `/` renders the paste-first landing page.
- `/clip/:id` renders the clipboard workspace for that id.
- `/app` and `/clipboard` continue to resolve into the app route through existing Vite/Vercel rewrites.
- Clipboard id context comes from route params or generated ids, not accounts.

## Core User Flows

### Open Or Create Clipboard

1. User lands on `/`.
2. User pastes text or enters an existing clipboard link/id.
3. If a link/id is provided, route to that board.
4. If text is provided, create a new board and save the first clip.
5. Open `/clip/:id`.

### Save Clip

1. User edits title, content, format, and tags.
2. User clicks `Save` or uses supported keyboard actions.
3. App normalizes clip data, deduplicates exact text where appropriate, persists locally, and queues encrypted remote sync if available.
4. UI shows saved/sync status and adds the clip to history.

### Copy

- `Copy link` copies the current clipboard URL.
- `Copy latest` copies the newest saved clip.
- `Copy` copies the selected clip.
- Copy actions must show success/error feedback.

### Password Protection

1. User opens password controls.
2. User sets a password for the clipboard.
3. App derives an AES-GCM key with PBKDF2 and encrypts the payload before storage/sync.
4. Protected boards require unlock before content is readable.
5. Removing password re-saves the board in link-encrypted sync mode.

### Import And Export

- Import accepts supported text/JSON-like payloads up to the configured local import limit.
- Export downloads the full clipboard payload as JSON.
- Invalid imports must fail with a clear error toast and leave existing data untouched.

## Data Model

### Clip

```json
{
  "id": "clip_...",
  "title": "Create user endpoint",
  "text": "{ ... }",
  "format": "JSON",
  "pinned": true,
  "starred": false,
  "tags": ["api", "users"],
  "createdAt": "2026-05-09T00:00:00.000Z",
  "updatedAt": "2026-05-09T00:00:00.000Z"
}
```

### Clipboard Payload

```json
{
  "clips": [],
  "selectedId": "clip_...",
  "draft": {
    "title": "",
    "text": "",
    "format": "JSON",
    "tags": []
  }
}
```

### Stored Record

- Local storage is namespaced by clipboard id.
- Versioned records are normalized for backward compatibility.
- Unprotected remote sync still sends an encrypted payload, using the clipboard id as the link-derived key.
- Password-protected records encrypt payloads with a password-derived key.

## Storage

- Local durability uses browser `localStorage`.
- Storage key format is controlled by `storageKey(clipboardId)` in `src/features/clipboard/clipboard-store.js`.
- Hosted sync uses `/api/clip/:id`.
- Hosted storage supports Upstash Redis REST or Vercel KV-compatible REST variables:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
  - `KV_REST_API_URL`
  - `KV_REST_API_TOKEN`
- If hosted storage is unavailable, the API falls back to per-function memory and the app remains locally useful.

## API Contract

### `GET /api/clip/:id`

Returns the encrypted clipboard record for a valid id.

Responses:

- `200` with encrypted record.
- `400` for invalid id.
- `404` when not found.
- `429` when rate limited.

### `PUT /api/clip/:id`

Accepts only versioned encrypted records. Plaintext payloads are rejected.

Responses:

- `200` with `{ "ok": true }`.
- `400` for invalid encrypted payload or malformed JSON.
- `413` when body exceeds the configured maximum.
- `429` when rate limited.

## Security Requirements

- No account model or auth tokens.
- Clipboard ids must match the API id validation pattern.
- API responses use `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
- Server accepts encrypted payloads only.
- Password encryption uses AES-GCM through Web Crypto.
- Password keys are derived with PBKDF2.
- Clipboard content should never be rendered through unsafe HTML.
- Markdown/HTML preview features, if added later, must sanitize output.
- Error messages must not leak secrets or full payload data.

## UI Requirements

### Landing Page

- Use a single decorative background image layer.
- Keep the first screen centered on the PasteVault logo, headline, subtitle, and paste/open input.
- Preserve accessible label/selector: `Paste something or enter a clipboard link`.
- Preserve primary CTA text: `Open clipboard`.
- Include minimal nav actions: theme and open clipboard.

### Clipboard Dashboard

- Desktop layout:
  - Left navigation/storage rail.
  - Top search/command bar.
  - Central editor as the main visual anchor.
  - History below the editor.
  - Right selected-clip details panel.
- Mobile layout:
  - Compact top actions.
  - Editor first.
  - History and details stacked.
  - Sticky bottom composer/action area.
  - No horizontal overflow.
- Common visible actions:
  - Save
  - Copy link
  - Paste/import
  - Password
  - Theme
- Secondary actions should live in dropdowns, menus, tabs, or details panels.

## Accessibility Requirements

- Preserve labels used by tests:
  - `Clipboard content`
  - `Paste something or enter a clipboard link`
  - `Open clipboard`
  - `Theme menu`
  - `Password optional`
  - `Copy link`
  - `Search history`
- All icon buttons need accessible names.
- Menus and tabs should be keyboard reachable.
- Focus states must be visible.
- Color contrast must remain readable in light and dark modes.
- Motion must respect reduced-motion preferences.

## Frontend Architecture

- `src/App.jsx` handles route-level dispatch.
- `src/pages/LandingPage.jsx` owns the paste-first landing experience.
- `src/pages/ClipboardPage.jsx` owns the app workspace and user flows.
- `src/features/clipboard/clipboard-store.js` owns normalization, persistence, crypto, sync, import/export, formatting, and clipboard helpers.
- `src/components/layout/LogoMark.jsx` owns reusable branding.
- `src/components/ui/*` contains shadcn/Radix-compatible reusable UI primitives.
- `src/components/BlurText.jsx` provides restrained React Bits headline motion.

## Technology

- Vite
- React 19
- shadcn/ui and Radix primitives
- HeroUI package available for app-style UI support
- Lucide icons
- React Bits-style motion through `motion`
- Inter variable font with system fallbacks
- Vercel serverless API route

## Verification

Required checks:

```powershell
npm run lint
npm run build
npm test
npm run api:check
npm run functional:check
npm run interaction:check
npm run visual:check
npm audit --audit-level=moderate
```

Manual QA:

- `/` loads the landing page in light and dark modes.
- `/clip/visual-check-board` loads editor, history, and details.
- Theme switching works.
- Save, paste, copy link, copy latest, delete, pin, star, tags, import, export, password, search, sort, and filter work.
- Mobile has no horizontal overflow.
- Large and malformed content behave safely.

## Release Criteria

- All required checks pass.
- No known broken buttons, dead links, or inaccessible primary actions.
- API rejects plaintext or oversized sync payloads.
- Desktop and mobile screenshots match the intended design direction closely.
- The app remains usable without hosted storage.
