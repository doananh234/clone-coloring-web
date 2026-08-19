# "Regen Thêm" Creates Additional Interior Pages (retire page variants)

**Date:** 2026-08-19
**Status:** Approved design → implementation plan next

## Problem

The book-level **"Regen Thêm" (regen-add)** button currently generates non-destructive
**variants** of a single page (`page.variants[]`, `origin:"regen"`), shown in a
"BIẾN THỂ" strip inside the page modal where one can be selected as the live image.

Operators actually want "Regen Thêm" to **increase the number of interior pages** —
each generated image should be a **full, real interior page** of the book: counted,
exported to the ZIP, rendered in the PDF, and shown inline at the end of the Interior
list with a distinct background so it's recognizable as a gen-added page.

The codebase already has the "additional interior page" concept (used by the
clone-job **fill-interior** flow): `BookColoringPage.origin: "additional"` +
`parentPageNumber`, rendered by `bookPageTone()` with the `"additional"` tone
(different background) and labeled `#<parent>·A<rank>` by `deriveBookPageLabel()`.
The book-level "Regen Thêm" just feeds the variant system instead of creating these
additional pages.

## Decision

Repurpose "Regen Thêm" to **append additional interior pages** to
`book.coloringPages` (mirroring fill-interior), and **remove the page-variant
mechanism** entirely. A one-time migration converts existing regen variants into
additional pages so no data is lost.

| Decision | Choice |
|---|---|
| What "Regen Thêm" produces | New `BookColoringPage` entries with `origin:"additional"`, appended to the END of `coloringPages` |
| Generation | Unchanged: `editImage(sourceUrl, prompt)` with `source A/B` + `changePercent`, `count` 1–4 |
| `parentPageNumber` | `source.parentPageNumber ?? source.sourcePageNumber ?? (sourceIndexInInterior + 1)` |
| Display | No render change — Interior section already tones `additional` pages differently + labels `#<parent>·A<rank>`; new pages append to the end |
| Counting / PDF / ZIP | Automatic — they are real `coloringPages` entries |
| Deletion | Reuse the existing page "Xóa" (`removePage` = PUT book with the page filtered out; no origin guard) |
| Variant system | Removed: strip UI, select/remove, variant routes, hook |
| Existing regen variants | One-time migration → additional pages (gated backfill script) |

## Architecture

### New pure module — `packages/coloring/src/data/additional-pages.ts`

Side-effect-free helpers, unit-tested, shared by the route and the migration:

```ts
import type { BookColoringPage } from "./types";

/** The interior "parent number" a new additional page groups under. */
export function additionalParentNumber(
  source: Pick<BookColoringPage, "origin" | "parentPageNumber" | "sourcePageNumber">,
  sourceIndexInInterior: number,
): number {
  if (source.origin === "additional" && source.parentPageNumber != null) return source.parentPageNumber;
  if (source.sourcePageNumber != null) return source.sourcePageNumber;
  return sourceIndexInInterior + 1;
}

/** Build one additional interior page from a generated image. */
export function buildAdditionalPage(params: {
  id: string;
  url: string;
  parentPageNumber: number;
  prompt?: string;
  coloredUrl?: string;
}): BookColoringPage {
  const { id, url, parentPageNumber, prompt, coloredUrl } = params;
  return {
    id,
    url,
    isPublic: false,
    origin: "additional",
    parentPageNumber,
    ...(prompt ? { prompt } : {}),
    ...(coloredUrl ? { coloredUrl } : {}),
  };
}

/**
 * Migrate one page's regen variants to additional pages (one-time backfill).
 * - Restores the page's url/coloredUrl to its "original" variant (so the page
 *   reverts to its original line-art if a regen variant was live).
 * - Converts each "regen" variant to an additional page under this page's number.
 * - Strips variants + selectedVariantId.
 * Returns the same page reference semantics when there are no variants (no-op).
 */
export function planVariantMigration(
  page: BookColoringPage,
  sourceIndexInInterior: number,
  newId: () => string,
): { page: BookColoringPage; additional: BookColoringPage[] } {
  const variants = page.variants ?? [];
  if (variants.length === 0) return { page, additional: [] };

  const parentPageNumber = additionalParentNumber(page, sourceIndexInInterior);
  const original = variants.find((v) => v.origin === "original");
  const regens = variants.filter((v) => v.origin === "regen");

  const restored: BookColoringPage = {
    ...page,
    ...(original ? { url: original.url, coloredUrl: original.coloredUrl } : {}),
  };
  delete restored.variants;
  delete restored.selectedVariantId;

  const additional = regens.map((v) =>
    buildAdditionalPage({ id: newId(), url: v.url, coloredUrl: v.coloredUrl, prompt: v.prompt, parentPageNumber }),
  );
  return { page: restored, additional };
}
```

### Server — new route, remove variant routes

**Create `apps/admin/src/app/api/books/[bookId]/pages/[pageId]/additional/route.ts` (POST):**
Mirrors the current variants POST generation, but appends pages instead of variants.
- Body: `{ count?: number; source?: "A" | "B"; changePercent?: number }` (count clamped 1–4, pct clamped 5–95).
- Load book; find `idx = coloringPages.findIndex(p => p.id === pageId)` (404 if absent).
- Compute the source's interior index and `parentPageNumber = additionalParentNumber(source, interiorIndex)`.
- `anchorUrl = resolveR2Url(source.url)` (the page image directly — no "original variant" seeding).
- `prompt`: source A → `buildRedesignPrompt(pct)`; source B (only if `source.prompt`) → `buildRedesignPrompt(pct) + "\n\nORIGINAL SCENE DESCRIPTION (keep faithful to this):\n" + source.prompt`.
- Loop `count`: `editImage(anchorUrl, prompt)` → base64 → `uploadToR2` key `assets/${bookId}/pages/${newId}.png` → `buildAdditionalPage({ id:newId, url, parentPageNumber, ...(useB ? { prompt: source.prompt } : {}) })`.
- Append all created pages to `coloringPages`, `prisma.book.update`, `flushLangfuse()`.
- Response `{ success: true, added: created.length }`. 500 on error. Synchronous (same as today's regen-add; Redis-free).

**Delete the variant routes:**
`apps/admin/src/app/api/books/[bookId]/pages/[pageId]/variants/route.ts` and
`apps/admin/src/app/api/books/[bookId]/pages/[pageId]/variants/[variantId]/route.ts`.

### Client — hook + UI

- **Replace `use-page-variants.ts`** with a lean writer (new file
  `packages/coloring/src/data/use-page-additional.ts`) exposing:
  ```ts
  usePageAdditional(bookId): {
    enabled: boolean;
    regenAddPages: (pageId: string, opts: { count: number; source: "A" | "B"; changePercent: number }) => Promise<void>;
  }
  ```
  `regenAddPages` POSTs to the new `/additional` route then invalidates
  `["coloring","book",bookId]`. Guarded by `COLORING_WRITE_ENABLED` like today.
  Remove `select`/`remove`/optimistic variant logic.
- **`page-actions-row.tsx`:** remove the entire "BIẾN THỂ" strip block; keep the
  "Regen Thêm" button + its count/source/changePercent modal, wired to
  `regenAddPages`. Update copy: "Sinh thêm biến thể" → "Sinh thêm trang interior",
  button title accordingly.
- **`page-batch-select.tsx`:** `runAdd` calls `regenAddPages`; update the confirm
  text ("Regen Thêm N bản … Thêm biến thể" → "… Thêm N trang interior mới cho …").
  The overwrite paths ("Regen hàng loạt (ghi đè)" / single "Regen") are untouched.
- **No change to the Interior render** in `book-detail-screen.tsx`: additional pages
  already get `bookPageTone("interior", p) === "additional"` + `#<parent>·A<rank>`
  labels; appended pages appear at the end. After a regen the book query
  invalidates and they render.

### Migration — one-time backfill

`apps/worker/src/scripts/backfill-regen-variants-to-pages.ts` (mirrors the existing
`backfill-book-approved.ts` structure): for every `Book`, for each `coloringPages`
entry, apply `planVariantMigration(page, interiorIndex, () => crypto.randomUUID())`;
rebuild `coloringPages` as the restored pages with the additional pages appended at
the end; write back only if anything changed. Idempotent (a page with no `variants`
is a no-op). Gated in `deploy.sh` behind `RUN_REGEN_VARIANT_MIGRATION=1` (like
`RUN_BOOK_APPROVED_BACKFILL`), run once.

### Cleanup

- Delete `packages/coloring/src/data/use-page-variants.ts` (the React hook +
  `applyVariantSelection`/`applyVariantRemoval`) — replaced by
  `use-page-additional.ts`. Its only consumers are `page-actions-row.tsx` and
  `page-batch-select.tsx`, both updated by this work.
- **Keep `packages/coloring/src/data/page-variants.ts`.** It is still imported by
  the clone **reproduce** flow (`reproduce/helpers.ts` + `reproduce/route.ts` use
  `mirrorUrlToSelectedVariant`), which is out of scope. After migration no page has
  a selected variant, so `mirrorUrlToSelectedVariant` is a safe no-op there. The
  helpers this file exports that the deleted variant routes used
  (`ensureOriginalVariant`/`addVariants`/`selectVariant`/`deleteVariant`) become
  unused; leave them in place (dead but harmless — do not gold-plate the cleanup).
- Keep `PageVariant`, `BookColoringPage.variants?`, `selectedVariantId?` in
  `types.ts` (optional; harmless for reading any un-migrated data) but stop writing
  them.

## Error handling

| Case | Behaviour |
|---|---|
| Source page not found | 404 from the POST |
| `editImage` / R2 failure | 500 `{ error }` (same as today's regen-add); nothing appended |
| Write disabled (`COLORING_WRITE_ENABLED` false) | Hook throws the local-only guard; button already disabled |
| Migration: page with no variants | No-op (page returned unchanged) |
| Migration: no "original" variant present | Page url left as-is; regen variants still become additional pages |
| Deleting an additional page | Existing `removePage` filters it from `coloringPages` (no origin guard) |

## Testing

- **Unit (`additional-pages.test.ts`):**
  - `additionalParentNumber` — original source → its `sourcePageNumber`; additional source → its `parentPageNumber`; missing both → `index+1`.
  - `buildAdditionalPage` — sets `origin:"additional"`, the given `parentPageNumber`, omits `prompt`/`coloredUrl` when absent.
  - `planVariantMigration` — restores url/coloredUrl to the original variant; each regen variant becomes one additional page under the right parent; `variants`/`selectedVariantId` stripped; **no duplication** when a regen variant was the selected/live one; no-op for a page without variants.
- **Route:** POST appends `count` pages with `origin:"additional"` and the right `parentPageNumber`; 404 for a missing page (assert page-building via the pure helper; the `editImage`/R2 calls are mocked or exercised only in the staging step).
- **Manual (staging):** click "Regen Thêm" on an interior → new page(s) appear at the END of the Interior list with the additional background + `#<parent>·A<rank>` label; the page count increases; the ZIP export and PDF include them; the page is deletable via "Xóa". Run the migration on a book that still has regen variants → variants become additional pages, the page reverts to its original line-art, no duplicates.

## Out of scope (YAGNI)

- Auto-placing additional pages next to their parent (they go to the end, per the request).
- Keeping any read-only view of the old variant strip.
- Removing the now-unused `PageVariant` type / `variants` fields from `types.ts`.
- A UI to reorder interior pages.
