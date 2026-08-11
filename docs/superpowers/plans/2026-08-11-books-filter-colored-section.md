# Books UI — Interior Filter + Colored Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Add a server-side "Interior > 40" filter to the `/books` list; (2) in Book detail's "Trang sách" tab, split colorized pages into a new "Colored" section under Cover, leaving "Interior" as B&W-only.

**Architecture:** Part 1 threads a new `interior=gt40` query param from a books-screen `<Select>` → `useBooks` → `/api/books`, which adds a Prisma JSON numeric filter on the denormalized `data.specifications.pages`. Part 2 is a pure view change in `book-detail-screen.tsx`: partition `coloringPages` by `coloredUrl` and render a new `PageSection` (with a new `colored` tone) between Cover and Intro.

**Tech Stack:** TypeScript, React (`@vx/coloring`), Next.js API routes, Prisma (`@vx/db`), TanStack Query. No new dependencies, no schema change.

## Global Constraints

- **Server-side filter:** interior count is NOT available client-side (`/api/books` omits `coloringPages`); filter on `data.specifications.pages` (verified: JSON number, mirrors `coloringPages` length; 0 null / 1 drift out of 118 prod books) via `{ data: { path: ["specifications", "pages"], gt: 40 } }`. Never filter only the current page.
- **Filter values:** exactly two — `""` (Tất cả) and `"gt40"` (Interior > 40); fixed threshold 40 (no configurability).
- **Colored split:** `coloredPages` = `coloringPages` with a truthy `coloredUrl`; `bwPages` = the rest. Render order **Cover → Colored → Intro → Interior**. Preserve each page's ORIGINAL index in `coloringPages` for `deriveBookPageLabel` + `openPageAt`.
- **New tone:** add `"colored"` to `BookPageTone` and a green `TONE_STYLE.colored` entry (`label: "Colored"`). `bookPageTone()` never returns it.
- **Read/view only:** no writes, no schema change, no backfill.
- **Typecheck gate:** `@vx/coloring` has no typecheck script → `cd apps/admin && yarn typecheck` (baseline `.next/dev/types/routes.d.ts` noise; judge by delta). Coloring tests: `cd packages/coloring && yarn test`.

---

## File Structure

**Modify:**
- `apps/admin/src/app/api/books/route.ts` — `interior=gt40` filter condition.
- `packages/coloring/src/data/use-books.ts` — `interior` filter param → query.
- `packages/coloring/src/screens/books/books-screen.tsx` — filter `<Select>` + empty-state condition.
- `packages/coloring/src/data/book-page-label.ts` — add `"colored"` to `BookPageTone`.
- `packages/coloring/src/screens/books/book-detail-screen.tsx` — `TONE_STYLE.colored` + partition + Colored/Interior sections.

---

## Task 1: Interior > 40 filter (route → hook → UI)

**Files:**
- Modify: `apps/admin/src/app/api/books/route.ts` (after the `assign` filter block, ~line 44)
- Modify: `packages/coloring/src/data/use-books.ts`
- Modify: `packages/coloring/src/screens/books/books-screen.tsx`

**Interfaces:**
- Produces: `/api/books?interior=gt40` filters to books with `data.specifications.pages > 40`. `BooksFilter` gains `interior?: string`.

- [ ] **Step 1: Add the server-side filter condition**

In `apps/admin/src/app/api/books/route.ts`, immediately after the assignment-filter block (the `else if (assign === "assigned") ...` line, ~line 44) and before `const where: Prisma.BookWhereInput = ...`, add:
```ts
  // Temporary "Interior > 40" filter. Interior count is mirrored in the
  // denormalized data.specifications.pages (a JSON number == coloringPages length),
  // so we filter server-side without loading the heavy coloringPages array.
  const interior = (searchParams.get("interior") || "").trim();
  if (interior === "gt40") {
    and.push({ data: { path: ["specifications", "pages"], gt: 40 } });
  }
```

- [ ] **Step 2: Thread the param through `useBooks`**

In `packages/coloring/src/data/use-books.ts`, add `interior` to the `BooksFilter` interface (after `assign`):
```ts
  /** "gt40" → only books with more than 40 interior pages (data.specifications.pages). */
  interior?: string;
```
Inside `useBooks`, after `const assign = ...` (line ~39):
```ts
  const interior = filter.interior && filter.interior !== "" ? filter.interior : "";
```
Add `interior` to the query key:
```ts
    queryKey: ["coloring", "books", page, limit, q, cat, status, assign, interior],
```
And in the `queryFn`, after `if (assign) params.set("assign", assign);`:
```ts
      if (interior) params.set("interior", interior);
```

- [ ] **Step 3: Add the filter `<Select>` in books-screen**

In `packages/coloring/src/screens/books/books-screen.tsx`:

(a) After `const [assignFilter] = useQueryParam("assign", "all");` (~line 64):
```ts
  const [interior] = useQueryParam("interior", "");
```
(b) After `const setAssignFilter = ...` (~line 70):
```ts
  const setInterior = (v: string) => setParams({ interior: v || null, page: null });
```
(c) Pass into `useBooks` (~line 87) — change:
```ts
  const { books, total, totalPages, isLoading, isError } = useBooks(page, 24, { q, cat, status, assign: assignFilter });
```
to:
```ts
  const { books, total, totalPages, isLoading, isError } = useBooks(page, 24, { q, cat, status, assign: assignFilter, interior });
```
(d) Add the `<Select>` in the filter bar, after the assign filter `<div style={{ width: 150 }}>...assignFilter...</Select></div>` (~line 133):
```tsx
          <div style={{ width: 160 }}><Select value={interior} onChange={setInterior} options={[{ label: "Tất cả", value: "" }, { label: "Interior > 40", value: "gt40" }]} /></div>
```
(e) Update the "no match" empty-state condition (~line 165) — change:
```tsx
        q || cat || status !== "all" || assignFilter !== "all" ? (
```
to:
```tsx
        q || cat || status !== "all" || assignFilter !== "all" || interior ? (
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/admin && yarn typecheck`
Expected: no new errors vs baseline. (Confirms the Prisma JSON `gt` filter typechecks as `BookWhereInput` and the hook/UI wiring is sound.)

- [ ] **Step 5: Reasoning check (no route test harness)**

Write into the commit body: `interior=gt40` pushes `{ data: { path: ["specifications","pages"], gt: 40 } }` into the AND list, so the filter runs in the SQL query across the full library (correct under pagination), not on the current 24 rows. `specifications.pages` is a JSON number mirroring `coloringPages` length (verified on prod: 66/118 books > 40). Default (`interior=""`) adds no condition → all books.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/app/api/books/route.ts \
  packages/coloring/src/data/use-books.ts \
  packages/coloring/src/screens/books/books-screen.tsx
git commit -m "feat(books): server-side 'Interior > 40' filter on the books list"
```

---

## Task 2: Colored section in the "Trang sách" tab

**Files:**
- Modify: `packages/coloring/src/data/book-page-label.ts:13`
- Modify: `packages/coloring/src/screens/books/book-detail-screen.tsx` (`TONE_STYLE` ~line 70; `pages` area ~line 210; pages-tab render ~line 462-500)

**Interfaces:**
- Consumes: existing `PageSection`, `PageThumb`, `deriveBookPageLabel`, `bookPageTone`, `openPageAt`.
- Produces: a new `colored` `BookPageTone` value + `TONE_STYLE.colored` entry; a "Colored" section in the pages tab.

- [ ] **Step 1: Add the `colored` tone to `BookPageTone`**

In `packages/coloring/src/data/book-page-label.ts`, change line 13:
```ts
export type BookPageTone = "cover" | "intro" | "interior" | "additional";
```
to:
```ts
export type BookPageTone = "cover" | "intro" | "interior" | "additional" | "colored";
```

- [ ] **Step 2: Add the `TONE_STYLE.colored` entry**

In `packages/coloring/src/screens/books/book-detail-screen.tsx`, in the `TONE_STYLE` object (~line 70-75), add a `colored` entry (after `additional`):
```ts
  additional: { border: "var(--warning)", bg: "color-mix(in srgb, var(--warning) 14%, var(--neutral-100))", label: "Additional" },
  colored:    { border: "var(--success)", bg: "var(--success-bg)", label: "Colored" },
```

- [ ] **Step 3: Partition pages by coloredUrl**

In `book-detail-screen.tsx`, immediately after `const colored = pages.filter((p) => p.coloredUrl).length;` (~line 212), add:
```ts
  // Split for the "Trang sách" tab: colored pages get their own section; the
  // Interior section shows only B&W. Keep each page's ORIGINAL index (for labels
  // + preview prev/next via openPageAt).
  const coloredPages = pages.map((p, i) => ({ p, i })).filter((x) => Boolean(x.p.coloredUrl));
  const bwPages = pages.map((p, i) => ({ p, i })).filter((x) => !x.p.coloredUrl);
```

- [ ] **Step 4: Render the Colored section after Cover**

In the `tab === "pages"` block, immediately after the Cover `</PageSection>` + its `)}` (the cover block ending ~line 471) and before the Intro section (`{(b.summaryPages ?? []).length > 0 && (`), insert:
```tsx
                  {coloredPages.length > 0 && (
                    <PageSection tone="colored" count={coloredPages.length}>
                      {coloredPages.map(({ p, i }) => {
                        const label = deriveBookPageLabel(p, i, pages);
                        return (
                          <PageThumb
                            key={p.id || i}
                            page={p}
                            displayNumber={label.displayNumber}
                            tone="colored"
                            onClick={() => openPageAt(i)}
                          />
                        );
                      })}
                    </PageSection>
                  )}
```

- [ ] **Step 5: Point the Interior section at `bwPages`**

Replace the existing Interior section:
```tsx
                  {pages.length > 0 && (
                    <PageSection tone="interior" count={pages.length}>
                      {pages.map((p, i) => {
                        const label = deriveBookPageLabel(p, i, pages);
                        return (
                          <PageThumb
                            key={p.id || i}
                            page={p}
                            displayNumber={label.displayNumber}
                            tone={bookPageTone("interior", p)}
                            onClick={() => openPageAt(i)}
                          />
                        );
                      })}
                    </PageSection>
                  )}
```
with:
```tsx
                  {bwPages.length > 0 && (
                    <PageSection tone="interior" count={bwPages.length}>
                      {bwPages.map(({ p, i }) => {
                        const label = deriveBookPageLabel(p, i, pages);
                        return (
                          <PageThumb
                            key={p.id || i}
                            page={p}
                            displayNumber={label.displayNumber}
                            tone={bookPageTone("interior", p)}
                            onClick={() => openPageAt(i)}
                          />
                        );
                      })}
                    </PageSection>
                  )}
```

- [ ] **Step 6: Typecheck + coloring tests**

Run: `cd apps/admin && yarn typecheck` (expect no new errors — the new `BookPageTone` value keeps `TONE_STYLE` exhaustive)
Run: `cd packages/coloring && yarn test` (expect the full suite green)

- [ ] **Step 7: Manual verification (dev, tunnel to prod DB)**

Open a book with some colorized pages → tab "Trang sách": pages with a colored result now appear in a green **"Colored"** section directly under Cover, and are gone from the **Interior** section (which shows only B&W). A book with no colored pages shows no Colored section; clicking a colored thumb still opens its page preview with working prev/next.

- [ ] **Step 8: Commit**

```bash
git add packages/coloring/src/data/book-page-label.ts \
  packages/coloring/src/screens/books/book-detail-screen.tsx
git commit -m "feat(books): split Colored pages into their own section in the pages tab"
```

---

## Self-Review

**Spec coverage (`2026-08-11-books-filter-colored-section-design.md`):**
- Part 1 filter (Select + useBooks param + route condition on `specifications.pages gt 40`) → Task 1. ✅
- Part 1 empty-state includes the new filter → Task 1 Step 3(e). ✅
- Part 2 partition by `coloredUrl`, order Cover → Colored → Intro → Interior, original-index preserved → Task 2 Steps 3-5. ✅
- Part 2 new `colored` tone + `TONE_STYLE` entry → Task 2 Steps 1-2. ✅
- Read/view only, no schema change → both tasks (route adds a read filter; detail is view-only). ✅
- Testing: route reasoning check (Task 1 Step 5) + typecheck + coloring tests + manual (Task 2 Step 7). ✅

**Placeholder scan:** every code step has full code; the route reasoning check is explicit; no TODO/TBD. ✅

**Type consistency:** `BooksFilter.interior?: string` defined in Task 1 Step 2, consumed in the same task's UI (Step 3c) and route param (Step 1). `BookPageTone` gains `"colored"` in Task 2 Step 1; used in `TONE_STYLE.colored` (Step 2) and `tone="colored"` (Step 4) — `Record<BookPageTone, …>` stays exhaustive. `coloredPages`/`bwPages` are `{ p: BookColoringPage; i: number }[]`, consumed identically in Steps 4-5 (`{ p, i }` destructure, `openPageAt(i)`, `deriveBookPageLabel(p, i, pages)`). Filter value `"gt40"` identical in route (Step 1), and UI option (Step 3d). ✅
