# Books UI — Interior Filter + Colored Section Design

> Two small, independent book-UI improvements bundled in one spec. Both are read/view-only (no schema change, no writes).

## Part 1 — `/books` filter "Interior > 40"

### Goal
Add a temporary filter on the books list with two values — **"Tất cả"** (default, show all) and **"Interior > 40"** (only books with more than 40 interior pages).

### Data (verified on prod)
`/api/books` deliberately **omits `coloringPages`** from the list payload (heavy ~130KB/book), so interior count cannot be computed client-side. The interior page count is mirrored in `book.data.specifications.pages`, which — verified across all 118 prod books — is a JSON **number** equal to `jsonb_array_length(coloringPages)` (0 books null, only 1/118 off by drift). So the filter runs **server-side** via a Prisma JSON numeric comparison:
```ts
{ data: { path: ["specifications", "pages"], gt: 40 } }
```
Server-side is required for correctness under pagination (the codebase explicitly avoids client-side "filter only the current 24 rows").

### Design
- **`books-screen.tsx`**: add a `<Select>` next to the existing filters, options `[{label:"Tất cả", value:""},{label:"Interior > 40", value:"gt40"}]`, URL-backed via `useQueryParam("interior","")` + `setParams({ interior: v || null, page: null })` (resets to page 1 like the other filters). Pass into `useBooks(...)`.
- **`use-books.ts`**: add `interior?: string` to `BooksFilter`; when `interior === "gt40"`, set query param `interior=gt40`; add to the react-query key.
- **`/api/books` route**: read `interior` param; when `=== "gt40"`, push `{ data: { path: ["specifications", "pages"], gt: 40 } }` into the `and[]` filter list.
- Empty-state "no match" branch already covers extra filters (its condition should include the new filter so an empty filtered result shows "Không khớp" not "Thư viện trống").

### Notes
- Value is a fixed threshold (40), 2-value toggle — no configurability (YAGNI).
- The 1 book whose `specifications.pages` drifts from the real count is negligible and out of scope (no backfill).

---

## Part 2 — Split "Colored" from "Interior" in the "Trang sách" tab

### Goal
In Book detail → tab "Trang sách", when a page is colorized it should appear in a new **"Colored"** section directly under the Cover section (all colored pages live here). The **"Interior"** section below then shows only the remaining B&W pages, no longer mixing in colored ones.

### Current state
`book-detail-screen.tsx` renders the tab as: **Cover → Intro → Interior**, where the Interior section maps over ALL `pages` (= `book.coloringPages`). `PageThumb` already prefers `coloredUrl` and shows a "MÀU" badge, so colored pages currently appear (colored) mixed into Interior. `PageSection` derives its header label from `TONE_STYLE[tone].label`; `BookPageTone = "cover" | "intro" | "interior" | "additional"`.

### Design
- Partition `pages` (preserving each page's **original index** in `pages`, for labels + preview navigation):
  - `coloredPages` = pages with a truthy `coloredUrl`.
  - `bwPages` = pages without `coloredUrl`.
- New render order: **Cover → Colored → Intro → Interior**.
  - **Colored** section: rendered only when `coloredPages.length > 0`, right after the Cover section, using `PageSection` with a new `colored` tone. Each `PageThumb` uses `tone="colored"`; `displayNumber` = `deriveBookPageLabel(p, originalIndex, pages).displayNumber`; `onClick` = `openPageAt(originalIndex)`.
  - **Interior** section: now maps over `bwPages` (with original index) instead of all `pages`; count = `bwPages.length`; tone stays `bookPageTone("interior", p)`. Rendered only when `bwPages.length > 0`.
  - **Intro** section: unchanged (summaryPages are not in `coloringPages`, so unaffected).
- Add `"colored"` to `BookPageTone` (`book-page-label.ts`) and a matching entry in `TONE_STYLE` (`book-detail-screen.tsx`): a distinct green tone, `label: "Colored"` (e.g. `border: "var(--success)"`, `bg: "var(--success-bg)"`). `bookPageTone()` never returns `"colored"` (it only classifies cover/intro/interior/additional), so no exhaustiveness path breaks — the new value is used only for the Colored section header + its thumbs.

### Notes
- All `coloringPages` are interior-type pages (cover = `coverUrl`, intro = `summaryPages` are separate arrays), so every `coloredUrl` page is an interior — no cross-type edge cases.
- Preview prev/next (`openPageAt`) still walks the full `pages` array; clicking a colored page opens it and navigation spans all pages. Acceptable (unchanged behavior).
- The empty-state guard for the tab (`pages.length === 0 && summaryPages empty && !cover`) is unchanged.

---

## Testing & gate
- **Part 1:** no route test harness → written reasoning check in the commit body (param `interior=gt40` → adds the `specifications.pages gt 40` AND-condition; server-side so correct across pagination). Verify on prod with a SQL/count sanity check (66/118 books have >40).
- **Part 2:** pure view change → `cd apps/admin && yarn typecheck` (judge by delta) + `cd packages/coloring && yarn test`. Manual: colorize an interior page → it moves to the Colored section and disappears from Interior; a book with no colored pages shows no Colored section.
- No schema change, no backfill, no writes.

## File structure
**Modify:**
- `apps/admin/src/app/api/books/route.ts` — `interior=gt40` filter.
- `packages/coloring/src/data/use-books.ts` — `interior` filter param.
- `packages/coloring/src/screens/books/books-screen.tsx` — filter `<Select>` + empty-state condition.
- `packages/coloring/src/data/book-page-label.ts` — add `"colored"` to `BookPageTone`.
- `packages/coloring/src/screens/books/book-detail-screen.tsx` — Colored section + Interior split + `TONE_STYLE.colored`.
