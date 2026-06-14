# PasteVault Production Audit

Date: 2026-06-14

## Executive Summary

Readiness score: 9/10.

PasteVault is usable as a local-first clipboard now. The default workspace is `/new`, clipboard ids are created only after valid pasted or imported content exists, seeded demo records are gone, and direct Vercel SPA routes target the built app entry. Public cross-device sharing still depends on durable hosted storage being configured in Vercel.

## Improvements Completed

- Consolidated API helpers in `api/_shared.js`.
- Hardened encrypted record, settings, timestamp, content-version, and session validation.
- Preserved remote conflict detection and local drafts during version conflicts.
- Rejected production remote writes with `503` when durable storage is unavailable.
- Added honest local-only versus cloud-synced status and link feedback.
- Made `/new` the default route and scoped history to `/clip/:id?view=history`.
- Removed all seeded clipboard/demo content and identifiers.
- Added robust multi-file import with drag/drop, per-file and batch limits, partial success, duplicate detection, malformed JSON rejection, and binary/empty-file checks.
- Added graceful browser-storage and file-read errors.
- Added a conservative service worker and installable manifest without API caching.
- Improved password-modal accessibility, mobile layout coverage, editor rendering, and clipboard/store normalization.
- Added focused store, API, functional, interaction, sync, mobile, visual, and smoke checks.
- Pinned the fixed `esbuild` release while retaining the tested Vite 7 build pipeline.

## Security And Durability

- Remote clipboard payloads are encrypted before storage.
- Password-protected boards use password-derived AES-GCM keys.
- API ids are constrained to URL-safe values between 3 and 80 characters.
- API responses are `no-store` and include `nosniff`.
- In-memory API rate limiting is useful but is not globally durable across function instances.
- Durable sync requires either:
  - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
  - or `KV_REST_API_URL` and `KV_REST_API_TOKEN`

## Verification

The release suite covers:

```powershell
npm run lint
npm run build
npm test
npm run store:check
npm run api:check
npm run functional:check
npm run interaction:check
npm run sync:check
npm run mobile:check
npm run visual:check
npm audit --audit-level=moderate
```

Covered user flows include landing creation, blank and invalid input rejection, clipboard isolation, save, copy, password enable/unlock, conflict preservation, import/export, partial imports, history, search, sort, filter, tags, theme persistence, large clips, and responsive overflow checks.

## Remaining Production Work

- Configure durable hosted storage in Vercel for real cross-device sharing.
- Verify a deployed save/open flow from two separate browsers after the storage variables are configured.
- Add provider-level abuse protection if public traffic increases.
- Consider share-link expiry controls if long-lived public links become a core workflow.
