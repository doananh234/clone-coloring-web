# Coloring Style — Usage Gallery Design

> A standalone improvement (not part of the D1–D4 epic). Adds a "used to colorize" gallery to the coloring-style detail screen so operators can judge a style's quality from real results, then edit its tags or delete it via the existing buttons.

## 1. Goal

In the coloring-style detail screen, show every book page that was colorized with this style — grouped by the color variant (palette) used — so the operator can eyeball the style's output quality across books and decide whether to re-tag or delete it. Read-only: the decision-actions (edit tags, delete style) already exist on the detail screen.

## 2. Data model (existing — no schema change)

When a page is colorized, `apps/admin/src/app/api/coloring-styles/colorize/route.ts` writes onto that page object inside `book.coloringPages` (a JSON array):
- `coloringPages[i].coloringStyleId` = the style used
- `coloringPages[i].coloringVariantId` = the color variant used (or `null`)
- `coloringPages[i].coloredUrl` = the colored result image

A `ColoringStyle` has `variants[]` (color palettes), each `{ id, colorPalette: { primaryColors?, accentColors?, ... }, thumbnailUrl? }` (see `color-variants-section.tsx`). So per-page `coloringVariantId` maps to one of the style's variants.

This per-page signal (not `coverMeta`) is the authoritative record of "this style colorized this page" — it is written on every colorize, including manual styles applied to interior pages. `coverMeta.coloringStyleId` only captures clone-source cover styles, so it is NOT used here.

## 3. Decisions (locked in brainstorming)

- **Source = per-page** (`coloringPages[].coloringStyleId === styleId`), covering interior + cover pages — the complete, reliable signal for manual styles. NOT `coverMeta` (misses manual page colorizing).
- **Group by variant** — one block per color variant (with swatches + label + count), plus an "unknown palette" bucket last.
- **Interaction = click image → open the book detail** (`/books/{bookId}`). No inline actions; re-tag/delete use the existing detail-screen buttons.
- **Read-only** — a plain GET; works regardless of `COLORING_WRITE_ENABLED`. No schema change, no write.

## 4. API — `GET /api/coloring-styles/[id]/usages`

- Query books whose `coloringPages` contains a page with this style:
  ```ts
  const books = await prisma.book.findMany({
    where: { coloringPages: { array_contains: [{ coloringStyleId: id }] } }, // → jsonb @>
    select: { id: true, title: true, coloringPages: true },
  });
  ```
  Prisma's `array_contains` on a Json column generates PostgreSQL `@>`, matching arrays that contain an element which is a superset of `{ coloringStyleId: id }` — so only books that used the style are returned.
- For each returned book, iterate its `coloringPages` and keep pages where `page.coloringStyleId === id && page.coloredUrl`. Emit one usage per kept page:
  ```ts
  { bookId: book.id, bookTitle: book.title, pageId: page.id, coloredUrl: page.coloredUrl, coloringVariantId: page.coloringVariantId ?? null }
  ```
- Respond `{ usages: StyleUsage[] }`.
- Errors → 500 `{ error }`. A missing/empty result is a normal `{ usages: [] }`, not an error.

`StyleUsage = { bookId: string; bookTitle: string; pageId: string; coloredUrl: string; coloringVariantId: string | null }`.

## 5. Pure helper + unit test — `packages/coloring/src/data/group-style-usages.ts`

Grouping is pure client logic (the detail screen already holds `entity.variants`), so it lives in a tested helper — no subpath export needed.

```ts
export interface StyleUsage { bookId: string; bookTitle: string; pageId: string; coloredUrl: string; coloringVariantId: string | null }
export interface UsageVariant { id?: string; colorPalette?: { primaryColors?: string[] } }
export interface UsageGroup { variantId: string | null; label: string; swatches: string[]; usages: StyleUsage[] }

/** Group usages by coloringVariantId; resolve label ("Bảng màu N" by the variant's
 *  index in `variants`) + swatches (variant.colorPalette.primaryColors) from the style's
 *  variants. Usages whose variantId is null or not found in `variants` go into a final
 *  "Khác · không rõ bảng màu" group. Known-variant groups are ordered by their index in
 *  `variants`; the unknown group is always last. Empty groups are omitted. */
export function groupUsagesByVariant(usages: StyleUsage[], variants: UsageVariant[] | undefined): UsageGroup[];
```

Rules:
- Iterate `variants` in order; for each variant with `id`, collect usages whose `coloringVariantId === variant.id`. If any, emit a group `{ variantId: id, label: "Bảng màu " + (index+1), swatches: primaryColors ?? [], usages }`.
- Collect remaining usages (variantId null, or an id not present in `variants`) into one trailing group `{ variantId: null, label: "Khác · không rõ bảng màu", swatches: [], usages }` — only if non-empty.
- Never emit an empty group.

## 6. Hook — `packages/coloring/src/data/use-style-usages.ts`

```ts
useStyleUsages(styleId: string) → { usages: StyleUsage[]; isLoading: boolean; isError: boolean }
```
React-query GET `${COLORING_API_BASE}/coloring-styles/{styleId}/usages`, cache key `["coloring", "style-usages", styleId]`, `enabled: !!styleId`. Returns `usages` (default `[]`).

## 7. UI — `packages/coloring/src/screens/entity/style-usages-section.tsx`

`StyleUsagesSection({ styleId, variants })`:
- Calls `useStyleUsages(styleId)`; groups via `groupUsagesByVariant(usages, variants)`.
- Renders a `Card title="Đã dùng để tô · N"` (N = total usages).
- Loading → `LoadingRows`; empty → muted "Chưa có trang nào tô bằng style này."
- Each group: a header row with swatches + label + `· {group.usages.length}`, then a responsive image grid (`coloredUrl` via `resolveImg`). Each image is a button → `router.push(`${B}/books/${bookId}`)`, with a small book-title caption/tooltip.
- **Soft cap:** show at most 24 images per group; if more, render a `+N` tile that also links to nothing extra (the count communicates the overflow). (Keeps a heavily-used style's detail page light.)

Rendered in `entity-detail-screen.tsx` right after `ColorVariantsSection` (line ~198), guarded `kind === "coloring-styles"`:
```tsx
{kind === "coloring-styles" && <StyleUsagesSection styleId={id} variants={entity.variants as UsageVariant[] | undefined} />}
```

## 8. Testing & gate

- **`group-style-usages.test.ts`** (Vitest): groups by variant in variant-order; resolves label (`Bảng màu 1/2…`) + swatches from `variants`; null/unknown variantId → single trailing "Khác" group; empty groups omitted; empty input → `[]`.
- **API route:** no route test harness — a written reasoning check in the commit body (the `array_contains` query returns only matching books; the JS filter keeps pages with matching `coloringStyleId` + a `coloredUrl`; response is `{ usages }`).
- **UI:** no unit test (presentational, consistent with the other section components).
- **Gate:** `cd apps/admin && yarn typecheck` (baseline `.next/dev/types/routes.d.ts` noise — judge by delta); `cd packages/coloring && yarn vitest run src/data/group-style-usages.test.ts` + full `yarn test` green.
- **Manual (dev, tunnel to prod DB):** open a coloring-style detail that has been used to colorize pages → the "Đã dùng để tô" gallery lists those colored pages grouped by palette; clicking an image opens the book; a never-used style shows the empty state.

## 9. File structure

**Create:**
- `packages/coloring/src/data/group-style-usages.ts` — types + `groupUsagesByVariant`.
- `packages/coloring/src/data/group-style-usages.test.ts` — helper unit tests.
- `packages/coloring/src/data/use-style-usages.ts` — react-query hook.
- `packages/coloring/src/screens/entity/style-usages-section.tsx` — the gallery section.
- `apps/admin/src/app/api/coloring-styles/[id]/usages/route.ts` — GET usages.

**Modify:**
- `packages/coloring/src/screens/entity/entity-detail-screen.tsx` — render `<StyleUsagesSection>`.

## 10. Risks / notes

- **Query cost:** `array_contains` is a jsonb `@>`; without a GIN index on `coloringPages` it is a sequential scan, but at ~118 books that is trivial. If book count grows large, a GIN index on `coloringPages` would keep it fast (out of scope now).
- **Legacy pages without `coloringStyleId`:** simply don't match — they never appear, which is correct.
- **Cache-busted `coloredUrl` (`?v=…`):** used as-is as the image src; `resolveImg` handles it. No dedupe needed (each page is one usage).
- **Heavily-used styles:** the 24/group soft cap bounds the DOM; the header count still shows the true total.
