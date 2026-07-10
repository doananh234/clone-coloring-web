# Post-One-Shot Cover Generation — Design

**Status:** Approved
**Date:** 2026-07-09
**Owner:** anh doan
**Related:** `packages/clone-core/src/steps/one-shot.ts`, `packages/clone-core/src/steps/create-book.ts`, Diaflow one-shot flow

---

## Problem

The current one-shot clone pipeline treats the first B&W redesigned page as the book's cover:

```ts
// stepCreateBook (create-book.ts:112, 125-127)
const firstImage = coloringPages[0]?.url ?? "";
coverUrl: firstImage,
thumbnailUrl: firstImage,
squareThumbnailUrl: firstImage,
```

An earlier attempt had Diaflow auto-generate a colored cover but the results were poor, so it was rolled back to the "all pages are B&W" behavior. The book now ships with a raw B&W cover and no real thumbnail.

Additionally, the `analyzeData` payload from Diaflow already contains rich per-page information — `titleCover`, `subtitle`, `isCover`, `isBW`, `characters`, `locations`, `visualDna`, etc. — but `stepOneShot` hand-picks only 6 fields (`scene`, `environment`, `characters`, `locations`, `props`, `reproductionPrompt`) before persisting, and `stepCreateBook` picks an even narrower subset into `sceneData`. All other fields are dropped, closing the door on future indexing/search.

## Goals

1. Produce a real colored, text-overlaid cover for every one-shot book, using existing infrastructure.
2. Persist enough metadata so the user can manually re-edit the cover text without regenerating from scratch.
3. Preserve the full per-page LLM output for future indexing/search.
4. Zero new external services — reuse `colorizeImage`, `editImage`, `renderTextOverlay`, and `TextOverlayModal` that already exist.
5. No Prisma schema migration — extend existing `Json` columns.

## Non-goals

- Custom text-overlay presets per brand (YAGNI — use global default `TEXT_PRESETS[0]`).
- Auto-retry AI blend on failure (YAGNI — mark job errored, admin re-runs manually).
- Regenerating covers for existing books already in the DB (out of scope — new pipeline only).
- Book-level meta call for books whose Diaflow output lacks `isCover`/`titleCover` — falls back to `bookData.title` with empty subtitle. No additional LLM call.
- Default **B&W style** on Brand — Diaflow one-shot owns B&W redesign, no config surface needed. Only `coloringStyleId` is added.

---

## Design decisions (locked)

| # | Decision |
|---|---|
| 1 | New step `stepGenerateCover` runs **after `stepCreateBook`** as a post-create hook. The Book row exists first with fallback URLs; the new step mutates it. |
| 2 | Coloring style source: **`Brand.data.coloringStyleId`**. Resolved from the brand the job is assigned to. **No `bwStyleId`** — B&W redesign belongs to Diaflow. |
| 3 | Cover text source: **`Book.bookData.titleCover` + `Book.bookData.subtitle`** — auto-populated by `stepOneShot` from the page whose `analyzeData.isCover === true`. Fallback: `bookData.title`, empty subtitle. |
| 4 | Middle page picker: **`Math.max(1, Math.floor(totalPages / 2))`** — 1-indexed. |
| 5 | Failure mode: on any throw, set `Book.data.coverMeta.status = "failed"`, keep fallback URLs, then rethrow → step runner marks `cloneJob.status = "error"`. |
| 6 | `stepOneShot` and `stepCreateBook` preserve the **full** `analyzeData` object with spread-plus-fallback (no data loss, backward compatible). |
| 7 | Text renderer relocation: `text-renderer.ts`, `text-overlay-presets.ts`, `text-overlay-types.ts` move from `apps/admin/src/lib/text-overlay/` → `packages/server-core/src/text-overlay/`. `apps/admin` re-imports from there. Worker + admin share one implementation. |
| 8 | Manual edit UI: reuse existing `TextOverlayModal` on Book detail page. Small tweak: when `coverMeta.sourceThumbnailUrl` exists, wire it as the modal's image (instead of `book.coverUrl`) and prefill `defaultTitle` / new `defaultFooter` from `coverMeta`. |
| 9 | **Brand lookup by ID first, name fallback.** `clone/route.ts` snapshots both `brandId` and `brand` (name) into `CloneJob.data`. Worker always refetches the current Brand row via `db.brand.findUnique(brandId)` at gen time (fresh data, immune to Brand renames). Fallback: `findFirst({ where: { name } })` for legacy jobs without `brandId`. |

---

## Data model additions

**No Prisma migration.** All fields live in existing `Json` columns.

| Location | Field | Type | Purpose |
|---|---|---|---|
| `Brand.data.coloringStyleId` | `string \| null` | Default coloring style for jobs under this brand |
| `CloneJob.data.brandId` | `string?` | **NEW** — snapshot brand id at job creation. Primary key for worker brand lookup. Immune to Brand renames. Legacy jobs without it fall back to `data.brand` (name). |
| `CloneJob.bookData.titleCover` | `string?` | Short cover header text (distinct from long `title`) |
| `CloneJob.pages[].rawData` | full analyzeData spread | Preserved per-page LLM output (adds `titleCover`, `subtitle`, `isCover`, `isBW`, `visualDna`, etc.) |
| `Book.coloringPages[].sceneData` | full rawData spread | Persists per-page LLM output onto Book for future indexing |
| `Book.data.coverMeta` | see shape below | Everything needed to manually re-edit the cover |

**`Book.data.coverMeta` shape:**
```ts
{
  titleCover: string;         // resolved header text
  subtitle: string;           // resolved footer text
  brandId: string | null;
  coloringStyleId: string;
  sourceThumbnailUrl: string; // R2 URL of the colorized middle page (NO text overlay yet)
  middlePageIndex: number;    // 1-indexed
  presetId: string;           // DEFAULT_PRESET_ID from text-overlay-presets
  status: "generated" | "failed" | "manual";
  generatedAt: string;        // ISO
  error?: string;             // present only when status = "failed"
}
```

---

## Diaflow LLM output shape (per page, confirmed)

```json
{
  "characters": [...],
  "locations": [...],
  "isBW": false,
  "isCover": true,
  "titleCover": "Peaceful Haven Moments",
  "subtitle": "Relaxing illustrations for mindful coloring"
}
```

- `isCover: true` marks the page carrying book-level meta (`titleCover`, `subtitle`).
- `isBW: false` distinguishes the LLM's tag for the original cover-style page vs pure B&W content pages. Preserved for future filtering — **not** used to pick the coloring source in this design.

---

## Changes to `stepOneShot`

**File:** `packages/clone-core/src/steps/one-shot.ts`

### a) Preserve full analyzeData per page

Replace the current pick (line 171-185) with a spread + fallbacks:

```ts
const analyze = (item.analyzeData ?? {}) as Record<string, unknown>;
const rawData = {
  ...analyze, // preserve every field the LLM emitted (titleCover, subtitle, isCover, isBW, visualDna, ...)
  scene: analyze.scene ?? { description: "", cameraView: "wide", composition: "" },
  environment: analyze.environment ?? {
    timeOfDay: "day", weather: "sunny", season: "neutral", mood: "peaceful",
  },
  characters: analyze.characters ?? [],
  locations: analyze.locations ?? [],
  props: analyze.props ?? [],
  reproductionPrompt:
    typeof analyze.reproductionPrompt === "string" ? analyze.reproductionPrompt : "",
};
```

Every downstream consumer that reads `rawData.scene`, `rawData.characters`, etc. still works — this is additive only.

### b) Extract book-level cover meta into `bookData`

Right after the `jobPages` loop, before the final `db.cloneJob.updateMany`, add:

```ts
const coverPageAnalyze = pages
  .map((p) => p.analyzeData as Record<string, unknown> | null | undefined)
  .find((d) => d?.isCover === true);

if (coverPageAnalyze) {
  const currentBookData = (job.bookData as Record<string, unknown> | null | undefined) ?? {};
  const merged = {
    ...currentBookData,
    // Do NOT overwrite user-provided values (user may have set titleCover
    // by hand in a previous run or via the create form).
    titleCover: currentBookData.titleCover ?? coverPageAnalyze.titleCover,
    subtitle: currentBookData.subtitle ?? coverPageAnalyze.subtitle,
  };
  await db.cloneJob.updateMany({
    where: { id: ctx.jobId },
    data: { bookData: merged as never },
  });
}
```

### c) Update the `CloneJobBookData` type

**File:** `packages/server-core/src/ai/clone-types.ts`

Add optional field:

```ts
export type CloneJobBookData = {
  title: string;
  titleCover?: string; // NEW — short cover header text
  subtitle?: string;
  description?: string;
  category?: string;
  categoryId?: string;
  ageRange?: string;
  artStyleId?: string;
};
```

---

## Changes to `apps/admin/src/app/api/clone/route.ts`

**Snapshot `brandId` alongside brand name.** Around line 92 (where `brand` is read from the request body), also read `brandId`. Around line 160-164 (where `cloneJobData` is built), include it:

```ts
const cloneJobData = {
  sourceBookId,
  thumbnailUrl: null as string | null,
  brand,     // name — kept for legacy readers
  brandId,   // NEW — primary lookup key for worker steps
};
```

Same change in `apps/admin/src/app/api/clone/import-csv/route.ts` line 101 area (CSV import path also snapshots brand — snapshot brandId too if the CSV row provides it, otherwise `null`).

## Changes to `resolveBrandInfo` (in `stepOneShot`)

**Prefer brandId lookup, name fallback.** `resolveBrandInfo` currently only returns the brand NAME string for Diaflow's `brand_info` payload. Extend it to:

```ts
async function resolveBrand(job, db): Promise<{ id: string; name: string; data: Record<string, unknown> } | null> {
  const jobData = (job.data as Record<string, unknown> | null | undefined) ?? {};
  const brandId = typeof jobData.brandId === "string" ? jobData.brandId : null;
  if (brandId) {
    const b = await db.brand.findUnique({ where: { id: brandId } });
    if (b) return { id: b.id, name: b.name, data: (b.data as Record<string, unknown>) ?? {} };
  }
  const brandName = typeof jobData.brand === "string" ? jobData.brand.trim() : "";
  if (brandName) {
    const b = await db.brand.findFirst({ where: { name: brandName } });
    if (b) return { id: b.id, name: b.name, data: (b.data as Record<string, unknown>) ?? {} };
  }
  const fallback = await db.brand.findFirst({ orderBy: [{ index: "asc" }, { createdAt: "asc" }] });
  return fallback ? { id: fallback.id, name: fallback.name, data: (fallback.data as Record<string, unknown>) ?? {} } : null;
}
```

Existing `resolveBrandInfo` becomes a thin wrapper that returns `.name` for Diaflow. `stepGenerateCover` uses the full resolver result.

## Changes to `stepCreateBook`

**File:** `packages/clone-core/src/steps/create-book.ts`

Replace the picked `sceneData` (lines 84-99) with the full spread:

```ts
sceneData: p.rawData ? { ...p.rawData } : undefined,
```

The rest of `stepCreateBook` is unchanged. `coverUrl` / `thumbnailUrl` / `squareThumbnailUrl` still get `firstImage` as fallback — the new `stepGenerateCover` overwrites them.

---

## New step: `stepGenerateCover`

**File:** `packages/clone-core/src/steps/generate-cover.ts` (new)

### Interface

```ts
export interface GenerateCoverDeps {
  colorizeImage: (imageUrl: string, directive: string, opts?: { referenceImageUrls?: string[] }) => Promise<{ base64: string; dataUrl: string }>;
  editImage: (imageDataUrl: string, prompt: string) => Promise<{ base64: string; dataUrl: string }>;
  renderTextOverlay: (imageBuffer: Buffer, opts: { header?: TextBlockConfig; footer?: TextBlockConfig }) => Promise<Buffer>;
  uploadToR2: (args: { key: string; body: Buffer; contentType: string }) => Promise<{ url: string }>;
  resolveR2Url: (key: string) => string;
}

export async function stepGenerateCover(
  ctx: JobContext,
  db: PrismaClient,
  deps: GenerateCoverDeps,
): Promise<void>;
```

### Algorithm

```
1. Load Book row via cloneJob.resultBookId. If missing → throw.

2. Resolve inputs (ALWAYS refetch Brand row — never trust snapshot data):
   - brandId   = cloneJob.data.brandId  (new snapshot; may be undefined on legacy jobs)
   - brandName = cloneJob.data.brand
   - brand = brandId ? db.brand.findUnique({ where: { id: brandId } }) : null
   - if !brand: brand = brandName ? db.brand.findFirst({ where: { name: brandName } }) : null
   - if !brand: throw "Brand not found (id=<brandId>, name=<brandName>)" — do NOT auto-pick first brand for cover (too risky, coloringStyleId matters)
   - coloringStyleId = brand.data?.coloringStyleId
     If missing → throw "Brand '<brand.name>' has no default coloringStyleId configured"
   - coloringStyle = db.coloringStyle.findUnique({ where: { id: coloringStyleId } })
     If missing or !colorizationDirective → throw
   - totalPages = book.coloringPages.length
     If totalPages < 1 → throw "Book has no coloring pages"
   - middleIdx = Math.max(1, Math.floor(totalPages / 2))
   - middlePage = book.coloringPages[middleIdx - 1]
     If !middlePage?.url → throw

3. Resolve cover text (all from bookData; stepOneShot already populated it):
   - titleCover = bookData.titleCover || bookData.title || book.title || "Coloring Book"
   - subtitle   = bookData.subtitle  || ""

4. Colorize middle page:
   - Resolve URL for the B&W redesigned image.
   - Fetch reference images from the coloringStyle.
   - Call deps.colorizeImage(resolvedUrl, coloringStyle.colorizationDirective, { referenceImageUrls }).
   - Convert base64 → Buffer.
   - Upload to R2 at key = `assets/clone-jobs/{jobId}/cover/thumbnail.png`.
   - sourceThumbnailUrl = uploaded R2 URL.

5. Canvas-render text overlay on the colorized thumbnail (server-side):
   - header = { ...DEFAULT_PRESET_BLOCK, text: titleCover, position: "top" }
   - footer = subtitle
       ? { ...DEFAULT_PRESET_BLOCK, text: subtitle, position: "bottom-center" }
       : undefined
   - Call deps.renderTextOverlay(thumbnailBuffer, { header, footer }) → overlaidBuffer.

6. AI blend the overlaid image:
   - Convert overlaidBuffer → dataUrl.
   - Prompt: same string used by /api/generate/text-overlay-blend/route.ts (moved to a
     shared constant so worker and API route stay in sync).
   - Call deps.editImage(dataUrl, blendPrompt).
   - Convert result base64 → Buffer.
   - Upload to R2 at key = `assets/clone-jobs/{jobId}/cover/cover.png`.
   - coverUrl = uploaded R2 URL.

7. Mutate Book row:
   await db.book.update({
     where: { id: book.id },
     data: {
       coverUrl,
       thumbnailUrl: sourceThumbnailUrl,
       squareThumbnailUrl: sourceThumbnailUrl,
       data: {
         ...currentBookData,
         coverMeta: {
           titleCover, subtitle,
           brandId: brand.id,
           coloringStyleId,
           sourceThumbnailUrl,
           middlePageIndex: middleIdx,
           presetId: DEFAULT_PRESET_ID,
           status: "generated",
           generatedAt: new Date().toISOString(),
         },
       } as never,
     },
   });

8. On any throw before step 7 completes:
   - If Book row exists, patch Book.data.coverMeta.status = "failed" and coverMeta.error = err.message.
   - Rethrow → step runner marks cloneJob.status = "error", cloneJob.error = err.message.
   - Book row keeps fallback coverUrl (firstImage from stepCreateBook), still viewable.
```

### Wiring

- Export from `packages/clone-core/src/steps/index.ts`.
- Register in the worker step runner **after** `stepCreateBook`.
- `stepGenerateCover` calls `await ctx.markStepComplete("generate-cover")` on success.

---

## Shared text-overlay module

**Moved to** `packages/server-core/src/text-overlay/`:

- `text-renderer.ts` — server-side canvas rendering (was `apps/admin/src/lib/canvas/text-renderer.ts`)
- `text-overlay-presets.ts` — was `apps/admin/src/lib/text-overlay/text-overlay-presets.ts`
- `text-overlay-types.ts` — was `apps/admin/src/lib/text-overlay/text-overlay-types.ts`
- `blend-prompt.ts` — new: single source of truth for the AI blend prompt string used by both worker and `/api/generate/text-overlay-blend`.

Add subpath export in `packages/server-core/package.json`:
```json
"./text-overlay": "./src/text-overlay/index.ts"
```

Update imports in `apps/admin`:
- `apps/admin/src/components/text-overlay-modal.tsx`
- `apps/admin/src/components/cover-thumbnail-step.tsx`
- `apps/admin/src/app/api/generate/text-overlay/route.ts`
- `apps/admin/src/app/api/generate/text-overlay-blend/route.ts`

`apps/admin/src/lib/text-overlay/` and `apps/admin/src/lib/canvas/text-renderer.ts` — delete.

---

## Manual edit UI (small tweak, not a new feature)

Book detail page already has an **"Add Text Overlay"** button (`book-detail-page.tsx:619-633`) that opens `TextOverlayModal` with `book.coverUrl` as the image. That's the wrong base — the coverUrl already has AI-blended text on it, so editing again means AI-editing bad output.

**Tweak:**

1. `TextOverlayModal` — add prop `defaultFooter?: string` (mirroring the existing `defaultTitle`). Prefill both from `coverMeta` on open.

2. Book detail page button — when `book.data.coverMeta?.sourceThumbnailUrl` exists, use it (the clean colorized thumbnail) as the modal image instead of `book.coverUrl`:

```tsx
onClick={() => {
  const meta = book.data?.coverMeta;
  const isFromWorker = Boolean(meta?.sourceThumbnailUrl);
  setTextOverlayImageUrl(resolveUrl(isFromWorker ? meta.sourceThumbnailUrl : book.coverUrl));
  setTextOverlayDefaultTitle(meta?.titleCover ?? book.title);
  setTextOverlayDefaultFooter(meta?.subtitle ?? book.subtitle ?? "");
  setTextOverlayTarget("cover");
  setTextOverlayOpen(true);
}}
```

3. When the user applies from the modal:
   - Upload the new cover to R2 (existing modal already does this).
   - Update Book with new `coverUrl`.
   - Patch `coverMeta.status = "manual"` so future views know the AI cover was replaced.

---

## Files touched

**Modified (11):**

1. `packages/clone-core/src/steps/one-shot.ts` — preserve full analyzeData, extract book-level meta, refactor `resolveBrandInfo` → `resolveBrand`.
2. `packages/clone-core/src/steps/create-book.ts` — full rawData → sceneData spread.
3. `packages/clone-core/src/steps/index.ts` — export `stepGenerateCover` and its deps.
4. `packages/server-core/src/ai/clone-types.ts` — add `titleCover?` to `CloneJobBookData`.
5. Worker step runner (grep site: wherever `stepCreateBook` is called) — chain `stepGenerateCover` after it, provide deps.
6. `apps/admin/src/views/book-detail-page.tsx` — wire `coverMeta.sourceThumbnailUrl` and prefills into `TextOverlayModal` open handler.
7. `apps/admin/src/components/text-overlay-modal.tsx` — add `defaultFooter` prop.
8. `apps/admin/src/app/api/generate/text-overlay-blend/route.ts` + `apps/admin/src/app/api/generate/text-overlay/route.ts` — re-import from `@vx/server-core/text-overlay`.
9. Brand admin form (`apps/admin/src/crud/brands.ts` or the brand form config) — add `coloringStyleId` picker (`Brand.data.coloringStyleId`).
10. `apps/admin/src/app/api/clone/route.ts` — snapshot `brandId` into `cloneJobData` alongside `brand` name.
11. `apps/admin/src/app/api/clone/import-csv/route.ts` — snapshot `brandId` from CSV row when available.

**New (5):**

1. `packages/clone-core/src/steps/generate-cover.ts` — the new pipeline step.
2. `packages/server-core/src/text-overlay/text-renderer.ts` — moved from `apps/admin/src/lib/canvas/`.
3. `packages/server-core/src/text-overlay/text-overlay-presets.ts` — moved from `apps/admin/src/lib/text-overlay/`.
4. `packages/server-core/src/text-overlay/text-overlay-types.ts` — moved from `apps/admin/src/lib/text-overlay/`.
5. `packages/server-core/src/text-overlay/blend-prompt.ts` — new shared constant.

**Deleted:**

- `apps/admin/src/lib/canvas/text-renderer.ts`
- `apps/admin/src/lib/text-overlay/*.ts`

---

## Testing

Following `packages/core-uikit/*.test.ts` co-location convention:

**New unit tests:**

- `packages/server-core/src/text-overlay/text-renderer.test.ts` — smoke test for canvas rendering (header + footer + both) using an in-memory image buffer.
- `packages/clone-core/src/steps/generate-cover.test.ts` — with mock deps:
  - happy path: middle-page picked, colorize + blend called with expected args, Book row mutated correctly, `coverMeta.status = "generated"`.
  - fallback path: no `isCover` page → uses `bookData.title`, empty subtitle.
  - failure paths: brand has no `coloringStyleId` → throws; colorize throws → `coverMeta.status = "failed"` + rethrow; blend throws → same.
  - Book has 0 pages → throws.
  - `totalPages = 1` → middleIdx = 1 (guarded by `max(1, ...)`).
  - user-set `bookData.titleCover` NOT overwritten by Diaflow `titleCover`.

**Regression:**

- Existing `stepOneShot` behavior unchanged for legacy Diaflow responses (no `isCover`/`titleCover`): existing tests + one new test asserting rawData preserves unknown fields.

---

## Backward compatibility

- **Books already in DB:** no automatic backfill. Existing books keep their current `coverUrl`. Admin can manually re-render via the existing Text Overlay button (now smarter when `coverMeta` is present, harmless when it isn't).
- **Legacy Diaflow responses without `isCover`/`titleCover`:** `stepOneShot` extraction gracefully skips (nothing to extract); `stepGenerateCover` falls back to `bookData.title` and empty subtitle. Cover still produced.
- **Brands without `coloringStyleId`:** `stepGenerateCover` throws → job errored. Admin sets a style on Brand, retries the job.
- **Legacy jobs without `brandId` snapshot:** `resolveBrand` falls back to `findFirst({ where: { name } })`. Works as before if the brand hasn't been renamed. If it was renamed, throws with a clear message — admin fixes brand name in job data or sets brandId manually.
- **`sceneData` shape change:** now a superset — every existing consumer keeps working.
- **`TextOverlayModal` new `defaultFooter` prop:** optional, existing call sites unaffected.

---

## Failure handling summary

| Failure | Outcome |
|---|---|
| Diaflow LLM output lacks `isCover` / `titleCover` | Silent — fall back to `bookData.title`, no subtitle. |
| Brand has no `coloringStyleId` | `cloneJob.status = "error"`. Fallback URLs remain on Book. |
| `colorizeImage` throws | Same as above. `coverMeta.status = "failed"` with error message. |
| `renderTextOverlay` throws | Same. |
| `editImage` (AI blend) throws | Same. |
| Book has 0 coloring pages | Same. |
| Upload to R2 throws | Same. |

Every failure leaves the Book row viewable via its fallback cover. Admin sees a red job badge and can re-run the step.

---

## Open questions

None — all decisions in the table above are locked. Ready to break into an implementation plan.
