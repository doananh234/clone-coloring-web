# Book Export ZIP — Background Job + Cached Download Link

**Date:** 2026-08-18
**Status:** Approved design → implementation plan next

## Problem

The current "Export ZIP" button on the book detail screen opens the
`GET /api/books/[bookId]/export-zip` endpoint in a new tab. That endpoint fetches
**every** image of the book from R2 (often 100+ files), zips them in-memory with
JSZip, and streams the result as an attachment — all **synchronously inside the
request**. The browser tab hangs on a pending request for the whole build, so:

- It feels like the export "runs in the browser" and is very slow.
- The user cannot do anything else while it builds.
- There is no reusable link — every download rebuilds from scratch.
- You cannot collect many books' links to hand to a download manager (IDM /
  JDownloader) and pull them all at once.

## Goal

Replace the synchronous stream with a **background job that builds the ZIP once,
uploads it to R2, and returns a stable public download link** that the user can
copy. Opening a book that already has a fresh export shows the link immediately
(no rebuild). The user opens each book, copies its ready link, and pastes the
links into a download manager to fetch many books at once.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Link model | Background job builds ZIP → uploads to R2 → **static public link**, cached on the book |
| Where to trigger/collect | **Per-book button on the book detail screen** (no multi-select list UI in this iteration) |
| Build strategy | **Background job** reusing the existing `GenerationJob` / `generation-jobs` BullMQ queue |
| Old GET-stream download button | **Removed** — only the new link flow remains |
| Link security | **Public direct URL, no expiry** (book images are already public on R2) |

## Architecture

### Overview

```
[Book detail] "Tạo link export"
   │  POST /api/books/{bookId}/export-zip
   ▼
Enqueue route:
   collect export plan (book + source cloneJob) → compute content hash
   ├─ book.data.export.hash === hash AND object exists  → return { cached:true, url } immediately
   ├─ existing pending/running book-export job w/ same hash → return { jobId } (dedup)
   └─ else create GenerationJob(type="book-export", payload:{hash}) + enqueue → { jobId, status:"pending" }
         │
         ▼ (worker)
   runBookExport: collect plan (fresh) → build zip → upload R2 (public key)
         → write book.data.export = { url, hash, builtAt, filename }
         → GenerationJob.status="done", resultUrl=url
         │
         ▼
UI: useGenerationJobs() polls (4s while active) → on done, invalidates book query
   → book.data.export.url present → link box shows full URL + [Copy]
```

### Components

**1. Shared ZIP builder — `packages/server-core/src/book-export/build-export-zip.ts` (NEW)**

Extract the folder/image logic currently living inside the route into a reusable,
side-effect-free module. Public API:

```ts
// One entry = one image to place in the zip
type ExportEntry = { url: string; name: string };
type ExportFolder = { path: string; entries: ExportEntry[] };
type ExportPlan = { folders: ExportFolder[]; hash: string; filename: string };

// Reads book + (optional) source cloneJob, produces the folder plan and a
// content hash over all input image URLs + cloneJobId. NO image fetching here.
function collectExportPlan(book: Book, cloneJob: CloneJob | null): ExportPlan;

// Fetches every entry's bytes from R2 and returns the zip buffer.
// Missing/errored images are skipped (same tolerance as today).
async function buildExportZip(plan: ExportPlan): Promise<Buffer>;
```

Folder structure is **identical to today** (unchanged behaviour):

```
Main book/   Book cover | Book intro | Book interior      (source cloneJob imageUrl, split by pageType, excluded skipped)
Clone book/  Book cover | Book intro | Book interior | Book colored | Source cover | Source cover colored
```

- `hash` = `sha256(JSON.stringify(allInputUrls) + cloneJobId).slice(0,16)`.
- `filename` = `${slug(book.title)}-${hash8}.zip`.

**2. Enqueue route — `apps/admin/src/app/api/books/[bookId]/export-zip/route.ts` (REPLACED)**

- **`GET` removed.** The synchronous stream is gone; the download is the R2 link.
- **`POST`** (new):
  1. Load book (404 if missing) and its source cloneJob (via `data.cloneJobId`).
  2. `plan = collectExportPlan(book, cloneJob)`.
  3. **Cache hit:** if `book.data.export?.hash === plan.hash` → return
     `{ success:true, cached:true, url: book.data.export.url }` (no job).
  4. **Dedup:** if a `GenerationJob` with `type:"book-export"`, this `bookId`,
     `status ∈ {pending,running}`, and `payload.hash === plan.hash` exists →
     return `{ success:true, jobId, status }`.
  5. Else create `GenerationJob(type:"book-export", bookId, bookTitle, payload:{hash: plan.hash})`,
     `withQueueTimeout(enqueueGenerationJob(job.id))`, return `{ success:true, jobId, status:"pending" }`.
     On queue timeout → `queueUnavailableResponse({ jobId })` (503) — existing pattern.

**3. Worker handler — `runBookExport` in `apps/worker/src/processor/generation-job-processor.ts`**

Add a dispatch branch mirroring `runSourceCover`:

```ts
if (job.type === "source-cover") { ... }
else if (job.type === "book-export") { await runBookExport(job.id, job.bookId); }
else throw new Error(`Unknown generation job type: ${job.type}`);
```

`runBookExport(genJobId, bookId)`:
1. Load book + source cloneJob **fresh**; `plan = collectExportPlan(...)` (recompute
   hash from current data — the book may have changed since enqueue).
2. `buffer = await buildExportZip(plan)`.
3. Upload to R2, **public key** `assets/{bookId}/exports/{plan.filename}`,
   contentType `application/zip`, via existing `uploadToR2`.
4. Transactionally write `book.data.export = { url, hash: plan.hash, builtAt: <ISO>, filename: plan.filename }`
   (read-modify-write of `book.data` like `runSourceCover` does for `sourceCovers`).
5. `GenerationJob.update({ status:"done", resultUrl: url, resultId: plan.hash })`.

Errors are recorded on the job + re-thrown (existing processor wrapping handles it).

**4. Client — book detail screen (`packages/coloring/src/screens/books/book-detail-screen.tsx`)**

Replace the current `window.open(GET export-zip)` button with an **export-link box**:

- If `book.data.export?.url` exists → show:
  `Link export: <full url>  [Copy]  [Cập nhật link]`
- Else → show button `[Tạo link export]`.
- Click "Tạo link export" / "Cập nhật link" → `POST .../export-zip`:
  - `{ cached, url }` → show link box immediately.
  - `{ jobId }` → button shows "⏳ Đang tạo…"; rely on `useGenerationJobs` polling.
    When that book's `book-export` job hits `done`, the hook invalidates
    `["coloring","book",bookId]`, the book refetches, `data.export.url` appears,
    the link box renders.
- **[Copy]** copies the **fully-resolved** URL (`resolveImg`/`NEXT_PUBLIC_R2_PUBLIC_BASE_URL`
  + path), not the relative `/assets/...` path, so it is directly downloadable.

**5. Queue drawer + hook (`packages/coloring/src/data/`, `.../components/shell/generation-queue-drawer.tsx`)**

- Add `"book-export"` to `GenerationJobType`.
- Drawer: add a human label for `book-export` (e.g. "Xuất ZIP") and, for done
  jobs, render `resultUrl` as a copyable link (reuse the same Copy affordance).

### Data model

No Prisma migration required. Reuses:
- `GenerationJob` — new `type` value `"book-export"`; `payload = { hash }`;
  `resultUrl` = R2 zip url; `resultId` = hash.
- `Book.data.export` — new compound field `{ url, hash, builtAt, filename }`.

## Freshness & caching

- The **hash over input URLs** is the cache key. Any image add/remove/replace
  (regen, colorize, source-cover, cover candidates, page reorder that changes the
  URL set) changes the hash → next click rebuilds; unchanged → instant cached link.
- Hash-in-key (`{slug}-{hash8}.zip`) means each content version is a **new R2
  object** → no stale CDN cache; the link changes only when the book actually
  changed. Old objects are left in place (cheap; optional cleanup out of scope).

## Error handling

| Case | Behaviour |
|---|---|
| Redis unreachable at enqueue | `queueUnavailableResponse` (503) + job row persisted; reconciler re-enqueues on worker boot (existing) |
| Book not found | 404 from POST |
| Individual image fetch fails | Skipped by `buildExportZip` (same tolerance as today) — zip still produced |
| Worker throws | `GenerationJob.status="error"`, `error` message stored + shown in drawer |
| Book edited mid-build | Worker uses fresh data + writes the fresh hash; a stale cached link is simply superseded on next click |

## Testing

- **Unit (`build-export-zip.test.ts`, co-located in server-core):**
  - `collectExportPlan` produces the expected folder/entry layout for a book with a
    source cloneJob, and for a book without one (Clone-book folders only).
  - `collectExportPlan` hash is **stable** for identical input and **changes** when
    any input URL changes.
  - `buildExportZip` skips unfetchable entries and still returns a valid zip
    (mock `fetch`).
- **Route:** POST returns `cached` when `book.data.export.hash` matches; returns a
  `jobId` and creates exactly one `GenerationJob` when it doesn't; dedups a
  matching in-flight job.
- **Manual (staging):** click "Tạo link export" on a real book → drawer shows the
  job → on done, link box shows a public `.zip` URL → the URL downloads the zip
  directly (and works pasted into a download manager).

## Out of scope (YAGNI)

- Multi-select "generate links for many books at once" on the books list screen
  (may follow later; the per-book cached link already supports collecting links by
  opening each book).
- Presigned / expiring links.
- Cleanup/GC of superseded old zip objects on R2.
- Keeping the legacy synchronous GET download.
