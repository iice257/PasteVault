# Spec: Encrypted files and images

Status: decisions locked, ready to build. Nothing here is built yet.

## Positioning

A secure paste transfer medium, not file hosting. It is for the screenshot, PDF, contract or voice note you actually want encrypted on its way to another device. The product copy says so wherever files appear:

> Encrypted before it leaves your device. Up to 5 MB, kept for 7 days.

The headline flow is **paste an image or file on one device, open it on the other**, with no account. Choosing a file and dragging one in also work, but paste comes first in the UI and the copy.

## Non-goals

- Files over 5 MB, resumable or multipart uploads, streaming decryption.
- Accounts, billing or paid storage tiers.
- Server-side thumbnails, scanning or search, since the server cannot read the content.
- Sharing one file by its own link, separate from the clipboard link.
- Opening, editing or converting documents. Files are carried, not opened.

## Decisions

| Decision | Choice |
|---|---|
| Storage | **Supabase** (Storage for ciphertext, Postgres for quotas), in a dedicated project |
| Per-file cap | **5 MB** |
| Retention | **7 days** from upload, then deleted |
| Types | Nearly all major file types accepted, plus pasted images |
| Primary interaction | **Paste first**; attach button and drag and drop are secondary |
| Per-clipboard limits | 25 MB and 10 files (tunable constants) |
| Global storage budget | 600 MB hard stop (free plan is 1 GB) |

What 5 MB means in practice: photos, screenshots, PDFs, Office documents, audio notes and short clips fit. Video is accepted but only short clips and screen recordings fit, and over-limit files get a plain message saying why.

## Preview and thumbnail system

Files are carried, not opened, so only formats the browser can show safely get a preview. Everything else gets a themed tile.

| Kind | Examples | Treatment |
|---|---|---|
| Image | png, jpg, webp, gif, avif, svg | Thumbnail and lightbox. SVG only ever renders through `<img>`, so scripts never run |
| Video | mp4, webm, mov | Native player on click if the browser can play it, otherwise a tile |
| Audio | mp3, wav, ogg, m4a, flac | Native audio player |
| Text and code | txt, md, json, csv, log, source files | Syntax-highlighted read-only preview with line numbers. Language is auto-detected, can be changed by the user, and there is a Formatted view for Markdown, JSON and CSV (see below) |
| PDF | pdf | Browser's built-in PDF viewer, opened on click |
| Everything else | see tiles | Themed tile with an extension badge |

Themed tiles, by category and with light and dark variants:

| Category | Colour | Examples |
|---|---|---|
| Documents | blue | doc, docx, pages, odt, rtf |
| Spreadsheets | green | xls, xlsx, numbers, ods |
| Slides | orange | ppt, pptx, key, odp |
| Archives | amber | zip, rar, 7z, tar, gz |
| Design | purple | psd, fig, sketch, ai |
| Ebooks | teal | epub, mobi |
| Executables and installers | red, with a caution label | exe, msi, apk, dmg |
| Anything unknown | neutral grey | |

### Text and code preview

- **Auto-detect language** from the file extension first, then from a sample of the first 40 lines or 4 KB using cheap syntax signals (shebangs, `{`/`[` JSON shape, `<?xml`/`<html`, `def `/`import `, `SELECT`/`FROM`, `curl `, Markdown headings and fences, and so on). It reuses the app's existing format detector and highlighter, so there is no new dependency. A confidence score decides between a specific language and plain text, and accuracy is deliberately traded for speed.
- **The user can override.** A language selector sits on the viewer (the same list the editor already uses) and the choice sticks for that attachment on that device.
- **Source and Formatted views.** *Source* is highlighted text. *Formatted* is the visual view and is offered only where it makes sense: Markdown rendered with a safe renderer (raw HTML is escaped, links are inert until clicked and open with `rel="noopener noreferrer"`), JSON pretty-printed and collapsible, and CSV as a table. HTML, SVG and scripts are only ever shown as source, never rendered.
- **Limits.** Only the first 200 KB is highlighted, with a "Show full file" action beyond that, so a large log never freezes the viewer. Detection and highlighting run on that slice only.

Rules:
- Kind is decided by extension **and** a magic-byte check on the decrypted bytes, never by the declared MIME type alone. A mismatch falls back to a tile.
- Previews decrypt in memory only on demand and are never stored decrypted.
- Executables are accepted but never run or previewed, and show a caution label.
- The tile and the viewer share one component so mobile and desktop stay consistent.

## Design

### Encryption model

- Each file gets a **random 256-bit file key** and a random 96-bit IV and is encrypted with AES-GCM in the browser.
- The file key, IV, name, type, size and storage reference live in the clip's `attachments` array, **inside the already-encrypted clipboard payload**. Unlocked clipboards inherit link-derived protection and password-protected ones inherit the PBKDF2 key, so there is no new key management.
- Supabase sees only an opaque ciphertext object at a random path. Ciphertext size and upload time are visible, and cannot be hidden.
- A wrong key or modified object fails the AES-GCM tag check and shows an error, never garbage.

```js
// inside payload.clips[n]
attachments: [{
  id: "att_xxxxxxxx",
  name: "contract.pdf",
  type: "application/pdf",
  size: 183204,                // plaintext bytes
  key: "<base64 file key>",
  iv: "<base64>",
  fileId: "<uuid>",            // server-side record, no secrets
  expiresAt: "2026-10-19T00:00:00.000Z"
}]
```

### Storage layout

- **Private Supabase Storage bucket** `pv-files`. Objects are named `<clipboardId>/<random uuid>` and are never publicly readable.
- **Postgres tables**, row level security on with no policies, reachable only through the server's service role key:
  - `pv_files(id, clipboard_id, object_path, size, status, created_at, expires_at)`
  - `pv_usage(day, uploaded_bytes, egress_bytes)`
- Quotas and budgets are SQL aggregates, and reservations run in a single statement so concurrent uploads cannot overshoot.

### Upload flow

1. The client checks size and quota locally, then encrypts the file.
2. `POST /api/file/ticket { clipboardId, size }` validates the id, the 5 MB cap, per-clipboard quota, global budget and rate limit. It reserves a `pending` row and returns a signed upload URL.
3. The browser uploads the ciphertext straight to Supabase with that URL. Functions cap request bodies at about 4.5 MB, which is why the file never passes through our API.
4. `POST /api/file/confirm { fileId }` checks that the object exists with the reserved size, marks the row `ready` and sets `expires_at` to 7 days out. Unconfirmed reservations expire after an hour.
5. The client adds the attachment to the clip and saves normally, so it syncs like any other change.

### Download flow

`GET /api/file/:clipboardId/:fileId` checks that the row is ready and unexpired, records the bytes against the daily egress counter, and returns a signed download URL valid for about a minute. The client fetches the ciphertext, decrypts it, then previews or saves it.

### Delete, expiry and keep-alive

- Removing an attachment or its clip calls `DELETE /api/file/:clipboardId/:fileId`. Holding the clipboard link is the capability, as everywhere else in the app.
- A daily Vercel Cron job (`CRON_SECRET` protected) deletes expired and abandoned objects and rows. Because it touches the project every day, it also keeps the free Supabase project from pausing for inactivity.
- Expired attachments show as "Expired" on devices that still hold the clip.

### Storage adapter

An adapter interface (`reserve`, `confirm`, `signDownload`, `delete`, `sweep`) with a Supabase implementation for production and an in-memory one for the dev server and tests. `npm start` and every browser test keep working with no credentials, as they do today.

### Security

- Only ciphertext is stored, and the server never trusts declared types or names.
- Filenames are sanitised for display and download and never used as paths.
- Downloads and previews use `blob:` URLs created after decryption. Nothing is rendered as markup.
- CSP additions, and nothing else loosened: the Supabase host in `connect-src`, and `blob:` in `img-src`, `media-src` and `frame-src` (the last for the PDF viewer). Verified in Edge: a `blob:` PDF in an iframe renders under `object-src 'none'` with no CSP violation, so that directive stays closed. The viewer also offers an "Open in a new tab" link for browsers that block embedded PDFs.
- Ticket, confirm and download routes are rate limited per client, and signed URLs are short lived.

## UI

- **Paste first.** Pasting an image or file anywhere in the editor attaches it. The empty state and tools panel lead with "Paste an image or file".
- **Attach and drop** are secondary: an attach button in the editor toolbar, and drag and drop onto the editor. Dropping a `.txt` or `.json` still imports as text, with an "Attach instead" choice for the ambiguous case.
- **Attachment strip** under the clip: thumbnail or themed tile, name, size, time left, open, download and remove.
- **Progress and errors**: encrypting, uploading and decrypting states, with plain messages for too large, quota reached, expired, storage unavailable and could not decrypt.
- **Quota**: used and remaining shown in the tools panel.
- **Mobile**: attach opens the system picker including camera and photo library. Strip, viewer and tiles follow the existing mobile layout.

## Work breakdown

| Milestone | Scope | Done when |
|---|---|---|
| F0 Setup | Create a free Supabase project, connect it to the PasteVault Vercel project, migration for bucket and tables with RLS, adapter interface and constants | `/api/health` reports file storage ok |
| F1 Crypto and model | File encrypt and decrypt, `attachments` normalisation, export and import handling, unit tests | Round trip, wrong key and tamper tests pass |
| F2 API | Ticket, confirm, download and delete routes, quotas, global budget, egress guard, rate limits, memory adapter, daily cron sweep | API checks cover limits, quotas, abuse paths and expiry |
| F3 Client core | Paste, attach and drop, progress, encrypted upload, download and decrypt, attachment strip with generic tiles, error states, CSP | Paste on device A, byte-identical download on device B |
| F4 Previews | Image lightbox, video and audio players, text and code viewer (auto-detect, override, formatted view), PDF viewer, magic-byte checks, themed tiles by category | Each preview kind and each tile category verified |
| F5 Polish | Quota UI, product copy, caution labels, mobile pass, accessibility pass | Mobile and desktop checks pass |
| F6 Release | Browser tests (two devices, password-protected, over limit, expiry), docs, changelog, live check | Verified on production and tagged v3.1.0 |

## Time estimate

Estimates are focused working time with me building and you reviewing between milestones. The closest comparable is the v3 round (health, polling, pairing, tests, docs, release). Files is larger: new crypto, a new backend, abuse and egress controls, and a full preview system.

| Scope | Estimate | Includes |
|---|---|---|
| **Lean**: F0 to F3, plus image preview and generic tiles | about 1 to 1.5 working days | Paste, attach, drop, upload, download, delete, 5 MB cap, 7-day expiry |
| **Full spec as written** | about 3 to 3.5 working days | Everything above, including all previews, themed tiles, egress guard, cron, mobile and accessibility passes, full tests and docs |
| **Risk buffer** | add 20 to 25 percent | Signed URL behaviour, PDF and video playback differences across browsers, and mobile paste quirks are the likely surprises |

Rough split of the full estimate: F0 and F1 about half a day, F2 about three-quarters of a day, F3 about one day, F4 about three-quarters of a day, F5 and F6 about three-quarters of a day.

Your time: roughly 10 minutes for F0 (approve project creation, connect it to the Vercel project), a few minutes to answer questions, and review points after F3 and F6.

## Risks

1. **Free plan limits.** Supabase Free includes 1 GB of storage and 5 GB of uncached egress per month shared across database and storage, and going over can return HTTP 402 errors. Each download counts as egress, so the app tracks daily bytes and stops serving or accepting files before the limit, with a clear message. Check the current numbers on the [Supabase pricing page](https://supabase.com/pricing) before launch.
2. **Pausing.** Free Supabase projects pause after a week of inactivity. The daily cron doubles as a keep-alive, and the health check reports file storage status so a pause is visible quickly. Your four existing Supabase projects are all currently paused, so this has happened before.
3. **Anonymous uploads.** There are no accounts, so quotas, the global budget, rate limits and 7-day expiry are what stop abuse. A bot check such as Cloudflare Turnstile can be added later for about half a day.
4. **Size is visible.** Ciphertext size and upload time are visible to Supabase. Size-bucket padding is possible but not planned.
5. **Memory on low-end phones.** Single-shot encryption holds the file in memory a few times over. At 5 MB this is fine, and it is why the cap is not higher.
6. **Embedded viewers.** PDFs open in the browser's own viewer from a `blob:` URL. This is on click only, and the viewer runs in the browser's PDF sandbox, but it is the one place we hand decrypted bytes to a built-in renderer. Video and audio use native players the same way.
7. **Dev and test parity.** Signed URLs and RLS do not run in the memory adapter, so one live two-device test against the real project is part of release.

## Verification

- **Unit:** encrypt and decrypt round trip, wrong key, tampered ciphertext, IV uniqueness, magic-byte detection and tile categorisation.
- **API:** tickets refused over cap, over quota, over global budget, invalid clipboard id and rate limit; confirm and delete; expiry sweep; egress guard.
- **Browser:** paste, attach and drop; sync to a second device; byte-identical download; password-protected clipboard; over-limit and expired states; each preview kind and tile category; mobile layout without overflow.
- **Live:** one two-device paste, preview and download on production before release.

## Open items

None blocking. Two small ones to settle during F0: the Supabase region (London is closest to the Vercel functions) and whether to name the project `pastevault-files`.
