# Export Link Improvements — Stable Overwriting Link + Queue Quick-Copy

**Date:** 2026-08-19
**Status:** Approved design → implementation plan next
**Builds on:** `2026-08-18-book-export-zip-download-link-design.md` (the shipped export-zip feature)

## Problem

Two operator-reported gaps in the shipped book-export-ZIP feature:

1. **The export link changes when the book changes.** The ZIP is uploaded under a
   content-hashed key `assets/{bookId}/exports/{slug}-{hash8}.zip`. When the source
   book is edited, re-exporting produces a NEW hash → a NEW URL, so a link the
   operator already copied/collected now points at a stale ZIP. Operators want a
   **stable per-book link** that they re-export into (overwrite), so previously
   copied links keep working and just serve the fresh content.

2. **No quick way to grab a book's export link from the work queue.** Operators
   collect links by opening each book's detail screen. On the "Hàng đợi của tôi"
   kanban board they want a one-click **copy-zip-link icon** on each card (for
   books that already have a link) so they can gather links without opening books.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Link stability | **Fixed per-book R2 key** `assets/{bookId}/exports/export.zip` — URL never changes, even if the title changes. Re-export overwrites the same object. |
| Download filename | `Content-Disposition: attachment; filename="{slug}.zip"` so the downloaded file is still named by title despite the fixed key. |
| CDN freshness after overwrite | Set `Cache-Control: no-cache` on the object so Cloudflare revalidates. Verify on staging; add a Cloudflare cache purge only if a zone rule overrides origin headers. |
| Re-export trigger | The existing **"Cập nhật"** button on `ExportLinkButton` (manual). No new UI, no auto-rebuild-on-change, no staleness banner (YAGNI). |
| Queue copy icon | Top-right of each `queue-kanban` card, shown only when the book has an export link; copies the full resolved URL. |
| Queue data source | The books-list route already returns `data`; expose a derived `exportUrl` on each list row (same pattern as `niche`/`queueStatus`). |

## Part 1 — Stable, overwriting export link

### Change: fixed key + download filename + cache header

**Builder (`packages/server-core/src/book-export/build-export-zip.ts`):**
- `collectExportPlan` currently returns `filename = ${slug(bookTitle)}-${hash}.zip`.
  Change `filename` to `${slug(bookTitle)}.zip` (drop the hash — it's now only the
  human download name, not the storage key). `hash` still returned for caching.
- No other builder change; folder layout and hashing are unchanged.

**R2 helper (`packages/server-core/src/r2.ts`):**
- Extend `uploadToR2` params with optional `cacheControl?: string` and
  `contentDisposition?: string`, passed through to `PutObjectCommand`
  (`CacheControl`, `ContentDisposition`). Existing callers are unaffected
  (both optional).

**Worker (`apps/worker/src/processor/generation-job-processor.ts`, `runBookExport`):**
- Upload to the **fixed key** `assets/${bookId}/exports/export.zip` (was
  `assets/${bookId}/exports/${plan.filename}`).
- Pass `cacheControl: "no-cache"` and
  `contentDisposition: \`attachment; filename="${plan.filename}"\`` to `uploadToR2`.
- `book.data.export = { url, hash, builtAt, filename }` — `url` is now the stable
  relative path `/assets/{bookId}/exports/export.zip`; `filename` = `plan.filename`
  (the nice download name).

**Route (`apps/admin/src/app/api/books/[bookId]/export-zip/route.ts`):**
- Cache-hit now requires BOTH `data.export.hash === plan.hash` AND
  `data.export.url === /assets/{bookId}/exports/export.zip` (the current stable
  key). The url check auto-migrates any book still holding an old hash-named url
  from the previous version: same content but old-format url → treated as a miss →
  one rebuild writes the stable key and updates `data.export.url`. After that,
  rebuilds overwrite the same object so the url stays identical; only
  `hash`/`builtAt`/content change.
- Define the expected stable relative url once (e.g. a small helper
  `stableExportUrl(bookId)` returning `/assets/${bookId}/exports/export.zip`) and
  reuse it in the route's cache check and the worker's upload key so the two can
  never drift.

### Behaviour

- First export → builds → uploads to the fixed key → `data.export.url` set.
- Book edited → `hash` now differs → operator clicks **"Cập nhật"** → POST → not a
  cache-hit → new `book-export` job → worker rebuilds → **overwrites** the same key
  → same URL, fresh ZIP. Any previously copied link now downloads the new content.
- Book unchanged → **"Cập nhật"** → cache-hit → returns the same URL instantly, no
  rebuild.

### Migration / cleanup

The already-shipped version wrote hash-named objects
(`{slug}-{hash8}.zip`). Switching to the fixed key orphans those. This is
negligible — only test exports exist (the feature shipped today), and any
book's next export writes the new fixed key and updates `data.export.url`.
No migration job; orphan cleanup is out of scope.

## Part 2 — Queue quick-copy icon

**Books-list route (`apps/admin/src/app/api/books/route.ts`):**
- In the existing `rows.map(...)` (which already derives `niche` and
  `queueStatus` from `data`), add
  `exportUrl: (b.data as { export?: { url?: string } } | null)?.export?.url ?? null`.

**Type (`packages/coloring/src/data/types.ts`):**
- Add `exportUrl?: string | null` to `BookRow`.

**Kanban card (`packages/coloring/src/screens/queue/queue-kanban.tsx`):**
- In `Card`, when `book.exportUrl` is set, render a small **copy icon button**
  pinned to the card's top-right corner.
- On click: `e.stopPropagation()` (so the card's drag/`onOpen` doesn't fire), then
  copy `resolveImg(book.exportUrl)` (the FULL resolved URL) to the clipboard via
  `navigator.clipboard.writeText`, guarded (unavailable API / rejection → no
  false-positive; brief "copied" feedback via local state).
- Icon name `copy` (registry has it). Shown in every column, any book with a link.
- The card layout gains `position: relative`; the button is
  `position: absolute; top/right` with a small hit area, and its own
  `onPointerDown`/`onClick` stop propagation so it never starts a drag.

## Error handling

| Case | Behaviour |
|---|---|
| Overwrite served stale by CDN | `Cache-Control: no-cache` forces revalidation; if a zone cache-rule overrides origin headers, fall back to a Cloudflare purge (tracked, only if staging shows staleness). |
| `navigator.clipboard` unavailable (HTTP / permissions) | Copy handler no-ops safely and does NOT show "copied"; optional inline hint. Matches `ExportLinkButton` behaviour. |
| Book has no export yet | Card shows no icon (`exportUrl` null). |
| Concurrent re-export | Worker is idempotent; overwriting the same key twice is safe (same content for the same hash). |

## Testing

- **Unit (`build-export-zip.test.ts`):** `collectExportPlan().filename === \`${slug}.zip\``
  (no hash in the download name); hash still present and stable/sensitive as before.
- **Unit (r2):** `uploadToR2` forwards `cacheControl` + `contentDisposition` to the
  `PutObjectCommand` input (assert via a mocked S3 client `send`).
- **Route:** cache-hit still returns the stable url when `hash` matches; a changed
  hash creates exactly one job.
- **Kanban:** card renders the copy icon only when `exportUrl` is set; clicking it
  copies `resolveImg(exportUrl)` and does NOT trigger `onOpen`/drag (stopPropagation).
- **Manual (staging):** export a book → copy link → edit the book (e.g. regen a
  page) → "Cập nhật" → confirm the URL is IDENTICAL and now downloads the NEW ZIP
  (validates the fixed key + Cache-Control freshness). On the My Queue board, a book
  with a link shows the top-right copy icon; clicking copies a working link.

## Out of scope (YAGNI)

- Auto re-export when the source changes, and a "link is stale" banner on the
  detail screen.
- Cloudflare cache-purge integration (only if staging proves Cache-Control
  insufficient).
- Cleanup of orphaned hash-named objects from the previous version.
- Bulk "copy all links" on the queue board.
