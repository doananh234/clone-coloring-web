# Source Cover (B&W recompose, on-demand) — Design

**Date:** 2026-08-14
**Status:** Approved (brainstorming) — ready for implementation plan

## Problem

Testing cover generation today is painful:

1. **Can't test locally** — the cover step runs inside the clone-job pipeline, which enqueues to Redis and is processed by the worker. Redis + worker don't run locally (no WSL → Docker unstable; no native Redis), so the whole cover flow is untestable on a dev box.
2. **Must wait for a full job** — to see any cover output you have to run an entire clone job to completion.

Operators also want manual control over which interior page becomes the cover and how it is laid out, instead of the pipeline's single auto-generated cover.

## Goal

Add an on-demand way, from the **Book detail → "Trang sách" tab**, to convert any interior page into a **B&W "source cover"** — the interior line-art recomposed into a book-cover layout (a reserved title-safe area + the illustration in the remaining space), **kept in pure black-and-white line art (never colorized)**. The operator can then colorize a source cover with the existing per-page flow and push it to the book cover.

This runs **synchronously and Redis-free**, so it works locally over the SSH tunnel and returns a result immediately (~2 min per image) — solving both pain points.

## Decisions (from brainstorming)

1. **Top / Middle / Bottom = position of the title-safe area.**
   - `top` → title-safe = upper **25%**, illustration = lower **75%**
   - `bottom` → title-safe = lower **25%**, illustration = upper **75%**
   - `middle` → title-safe = middle band **~25%**, illustration split above + below
2. **Generation = AI recompose via Diaflow, output stays B&W** (no colorization, no shading/fills — pure line art).
3. **Execution = synchronous inline API route** (mirrors the existing `coloring-styles/colorize` route: imports only `prisma`/`r2`/`ai`, no queue). Works locally; UI shows a spinner while waiting.
4. **Source-cover action set = same as interior, minus Regen/Đổi góc** (those regenerate from the source clone-job page, which a synthetic source cover has no mapping to). Keep: pick style + **Tô màu**, **Push to Cover**, Set thumbnail, Set square, Công khai/Ẩn, Xóa.
5. **Storage = a separate `book.data.sourceCovers[]` array** (not mixed into `coloringPages`), so PDF/export-ZIP/page-count/numbering are untouched.
6. **Colorize keeps the B&W version.** Colorizing a source cover sets `coloredUrl` but never replaces `url`. The B&W stays in the "Source Cover" section; the colored result *also* appears in the "Colored" section — mirroring how Interior ↔ Colored already behaves.

## Data model

New array on `book.data`:

```ts
type SourceCover = {
  id: string;                         // uuid
  url: string;                        // B&W recomposed line-art (never mutated by colorize)
  coloredUrl?: string;                // set after Tô màu (B&W url preserved)
  isPublic: boolean;
  titleSafe: "top" | "middle" | "bottom";
  sourceInteriorId: string;           // coloringPages[].id this was converted from
  coloringStyleId?: string;           // style used when colorized
  coloringVariantId?: string | null;
  createdAt: string;                  // ISO
};
```

Stored at `book.data.sourceCovers: SourceCover[]`. Add the type to `packages/coloring/src/data/types.ts` (mirrors `BookColoringPage`) and to the server-side book-data typing where `coverCandidates` already lives.

## Components

### 1. Prompt — `buildCoverSourceBWPrompt(titleSafe)`

New file `packages/server-core/src/ai/prompts/cover-source-bw-prompt-template.ts`, exported from `prompts/index.ts`. Distinct from `buildCoverSourcePrompt` (which colorizes and forbids B&W). Rules:

- Recompose the FIRST image (an interior coloring page) into a **book-cover layout**, preserving subjects, concept, and the original line-art style.
- **Stay pure black-and-white line art**: black outlines on white only — **no color, no grayscale shading, no gradient, no filled areas**. Same stroke weight / shape language as the source.
- Reserve a **title-safe area = 25% of the canvas** at the position given by `titleSafe`:
  - `top` → upper 25% clear, illustration in the lower 75%
  - `bottom` → lower 25% clear, illustration in the upper 75%
  - `middle` → a ~25% horizontal band across the middle clear, illustration arranged above and below it
- Title-safe area is airy negative space (free of the main subject / large objects / dense detail) but **not empty** — scatter **sparse B&W line-art motifs** drawn from the original's own decorative elements.
- **No text** of any kind. Natural transition (no hard dividing line).

Parameterize the region wording by `titleSafe` (a small switch producing the "reserve upper/lower/middle 25%" clause and the "illustration in the … 75%" clause).

### 2. Function — `generateCoverSourceBW(imageUrl, titleSafe, options)`

In `packages/server-core/src/ai/image-provider.ts`, exported via `ai/index.ts`. Mirrors `generateCoverSource` but:
- takes `titleSafe` instead of a colorization directive,
- builds the prompt with `buildCoverSourceBWPrompt(titleSafe)`,
- calls `editImage(imageUrl, prompt, options)` (Diaflow when `IMAGE_PROVIDER=diaflow`).

Returns `GeneratedImage` (B&W PNG).

### 3. API route — `POST /api/books/[bookId]/source-covers`

New route `apps/admin/src/app/api/books/[bookId]/source-covers/route.ts`.

- `export const maxDuration = 300;`
- Body: `{ interiorPageId: string; titleSafe: "top" | "middle" | "bottom" }`.
- Load book; find the interior in `book.coloringPages` by `id === interiorPageId`; error 404 if missing / no url.
- `const img = await generateCoverSourceBW(resolveR2Url(page.url), titleSafe, { trace: { caller: "books/source-covers" } })`.
- Upload PNG to R2 key `assets/{bookId}/source-covers/{scId}.png`.
- Append a new `SourceCover` to `book.data.sourceCovers` and persist with `prisma.book.update`.
- Return `{ success: true, sourceCover }`.
- **Imports only** `prisma`, `@vx/server-core/r2`, `@vx/server-core/ai`, `@vx/server-core/langfuse` — no queue import → Redis-free → runs locally.

### 4. Colorize write-back for source covers

Extend the existing `apps/admin/src/app/api/coloring-styles/colorize/route.ts` with an optional flag so a source cover's colored result lands in `sourceCovers`, not `coloringPages`:

- Add optional body field `target?: "page" | "sourceCover"` (default `"page"`).
- When `target === "sourceCover"` and `bookId`+`pageId` given: after uploading, set `book.data.sourceCovers[pageId].coloredUrl` (+ `coloringStyleId`/`coloringVariantId`) instead of touching `coloringPages`. Upload key `assets/{bookId}/source-covers/{scId}-colored.png`.
- Everything else (Diaflow call, reference images, cache-bust) unchanged. **`url` (B&W) is never modified.**

### 5. UI — Book detail "Trang sách" tab

`packages/coloring/src/screens/books/book-detail-screen.tsx`:

- **New "Source Cover" card** rendered immediately **below `coverCard`** and above the pages `Card`, in the `tab === "pages"` branch.
- Card header right side: three buttons **Gen Cover (Top)**, **Gen Cover (Middle)**, **Gen Cover (Bottom)**.
- Each button opens an **Interior Picker dialog** — a modal grid of interior thumbnails (from `coloringPages`, B&W). Selecting one calls the gen route with the button's `titleSafe`, shows a spinner **"Đang tạo bìa… (~2 phút)"**, then closes and the new source-cover thumbnail appears.
- Source-cover thumbnails render like interior thumbs (B&W `url`), with a small badge showing `Top`/`Middle`/`Bottom`.
- Clicking a source-cover thumbnail opens the shared `PreviewModal` + `PageActionsRow` in **source-cover mode**.
- The **"Colored" section** source list becomes: colorized `coloringPages` **＋** colorized `sourceCovers` (any entry with `coloredUrl`). Clicking a colored source-cover entry opens the source-cover actions.

New hook `packages/coloring/src/data/use-source-covers.ts`:
- `gen(interiorPageId, titleSafe)` → POST the gen route, invalidate.
- `colorize(sc, styleId, variantId)` → POST colorize route with `target:"sourceCover"`, invalidate.
- `togglePublic(scId)` / `remove(scId)` → PUT `book.data.sourceCovers`.

### 6. `PageActionsRow` — source-cover mode

Add an optional prop `variant?: "page" | "sourceCover"` (default `"page"`):
- `sourceCover` → hide **Regen** and **Đổi góc**; route **Tô màu** through `use-source-covers.colorize` (so write-back targets `sourceCovers`); keep **Push to Cover**, **Set thumbnail**, **Set square**, **Công khai/Ẩn**, **Xóa** (delete removes from `sourceCovers`).
- `page` → current behavior, unchanged.

## Data flow

```
[Gen Cover (Top)] → Interior Picker → pick interior
   → POST /api/books/{id}/source-covers { interiorPageId, titleSafe:"top" }
   → generateCoverSourceBW → Diaflow (B&W) → R2 → book.data.sourceCovers += SC
   → thumbnail shows in "Source Cover" section (B&W)

[click SC] → PreviewModal + PageActionsRow(variant="sourceCover")
   → [Tô màu] → POST /coloring-styles/colorize { target:"sourceCover", bookId, pageId=scId, … }
        → Diaflow colorize → R2 → sourceCovers[scId].coloredUrl set (url B&W kept)
        → colored image appears in "Colored" section; B&W stays in "Source Cover"
   → [Push to Cover] → existing coverCandidates.push(scId, coloredUrl)
```

## Local testability

The gen route and the colorize route are both synchronous and Redis-free. With `yarn dev` + the SSH tunnel to prod Postgres, an operator can click **Gen Cover** and see the B&W source cover in ~2 min, then colorize it — all locally. This is the primary acceptance path.

## Testing

- **Unit — prompt:** `buildCoverSourceBWPrompt` asserts, for each `titleSafe`: the correct "reserve upper/lower/middle 25%" wording, the "illustration in the … 75%" wording, the pure-B&W / no-color constraints, and "no text".
- **Unit — route deps:** the gen route with a mocked `generateCoverSourceBW` + mocked R2/prisma appends a correctly-shaped `SourceCover` and returns it; 404 when the interior id is missing.
- **Unit — colorize write-back:** `target:"sourceCover"` writes `coloredUrl` into `sourceCovers[id]` and leaves `url` + `coloringPages` untouched.
- **Manual:** click each of Gen Cover (Top/Middle/Bottom) locally; verify title-safe placement, pure B&W, and that colorizing keeps the B&W and adds a Colored entry.

## Out of scope (YAGNI)

- No auto-colorize of source covers.
- No change to the pipeline's existing `generate-cover` step or `buildCoverSourcePrompt`.
- No change to PDF/export-ZIP/page counts (source covers live outside `coloringPages`).
- No Regen/Đổi góc for source covers.

## Affected files

- **New:** `packages/server-core/src/ai/prompts/cover-source-bw-prompt-template.ts` (+ test)
- **New:** `apps/admin/src/app/api/books/[bookId]/source-covers/route.ts`
- **New:** `packages/coloring/src/data/use-source-covers.ts`
- **New:** interior-picker dialog + Source Cover section (in/near `book-detail-screen.tsx`)
- **Edit:** `packages/server-core/src/ai/image-provider.ts` (+ `ai/index.ts`, `prompts/index.ts`)
- **Edit:** `apps/admin/src/app/api/coloring-styles/colorize/route.ts` (`target:"sourceCover"`)
- **Edit:** `packages/coloring/src/screens/books/book-detail-screen.tsx` (section + Colored merge + click wiring)
- **Edit:** `packages/coloring/src/screens/books/page-actions-row.tsx` (`variant` prop)
- **Edit:** `packages/coloring/src/data/types.ts` (`SourceCover` type + `book.data.sourceCovers`)
```
