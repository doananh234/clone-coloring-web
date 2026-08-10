# D4a — Book Ordering + Number/Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The book-detail screen shows Cover → Interior Intro → Interior as three distinct sections, each page badged with its inherited source page number and a background tone by type/origin.

**Architecture:** `create-book` (worker step + admin route) stamps `sourcePageNumber`/`origin`/`parentPageNumber` onto each book page (carried from the clone JobPage). A pure `deriveBookPageLabel` helper turns those into a display label (`#N` / `#parent·An`, with a positional fallback for pre-D4a books). The book-detail "Trang sách" tab renders three labeled sections and tints each thumbnail by tone. No data reordering (the Book already stores cover/intro/interior as separate arrays; interior is pageNumber-sorted from D3).

**Tech Stack:** TypeScript, React (coloring package), Prisma (`@vx/db`), Next.js API routes, Vitest.

## Global Constraints

- **Number semantics:** display number = inherited `sourcePageNumber` from the clone JobPage. Original → `#{sourcePageNumber}`; additional (D3 fill) → `#{parentPageNumber}·A{n}` where `n` is the 1-based rank among interior additional pages sharing that parent. Fallback (pre-D4a book, no metadata) → `#{index+1}`.
- **Marking storage:** DB persists only `sourcePageNumber?: number`, `origin?: "original" | "additional"`, `parentPageNumber?: number` (all optional, backward-compatible). Display label + color are DERIVED in the UI, never stored.
- **Background tone mapping** (theme has no indigo/amber/teal — use existing motio tokens): Cover → `--info` / `--info-bg`; Interior Intro → `--volt-500` accent + `--volt-200` bg; Interior original → default (`--border`, no tint); Interior additional → `--warning` border + `color-mix(in srgb, var(--warning) 14%, var(--neutral-100))` bg (same as D3's additional tint).
- **No backfill:** old books degrade gracefully via the fallback; do NOT write a migration/backfill.
- **Ordering:** do NOT reorder data. Book already stores `coverUrl` + `summaryPages[]` (intro) + `coloringPages[]` (interior, pageNumber-sorted). D4a only groups them visually.
- **Scope:** only `book-detail-screen.tsx`. Do NOT touch colorize, cover-editor, book-edit, or the "Chọn hình / Regen hàng loạt" tab.
- **Parity:** the worker `create-book.ts` and the admin `create-book/route.ts` must stamp the same fields identically.
- **Typecheck gate:** `@vx/coloring` + `@vx/clone-core` have no `typecheck` script — use `cd apps/admin && yarn typecheck` (baseline may show pre-existing `.next/dev/types/routes.d.ts` errors; judge by delta). Coloring tests: `cd packages/coloring && yarn vitest run <file>`.

---

## File Structure

**Create:**
- `packages/coloring/src/data/book-page-label.ts` — pure `deriveBookPageLabel` + input/output interfaces.
- `packages/coloring/src/data/book-page-label.test.ts` — helper unit tests.

**Modify:**
- `packages/coloring/src/data/types.ts` — add the 3 optional fields to `BookColoringPage` and to `BookDetail.summaryPages[]`.
- `packages/clone-core/src/steps/create-book.ts` — local `JobPage` interface + `buildPage` stamp the fields.
- `apps/admin/src/app/api/clone/[jobId]/create-book/route.ts` — `buildPage` stamp the fields (parity).
- `packages/coloring/src/screens/jobs/... ` — none.
- `packages/coloring/src/screens/books/book-detail-screen.tsx` — 3-section render in the "pages" tab + `PageThumb` label/tone.

---

## Task 1: `deriveBookPageLabel` pure helper

**Files:**
- Create: `packages/coloring/src/data/book-page-label.ts`
- Test: `packages/coloring/src/data/book-page-label.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface BookPageMetaInput { sourcePageNumber?: number; origin?: "original" | "additional"; parentPageNumber?: number }`
  - `interface BookPageLabel { displayNumber: string; isAdditional: boolean }`
  - `function deriveBookPageLabel(page: BookPageMetaInput, index: number, interior: BookPageMetaInput[]): BookPageLabel`
  - `type BookPageTone = "cover" | "intro" | "interior" | "additional"` and `function bookPageTone(section: "cover" | "intro" | "interior", page: BookPageMetaInput): BookPageTone`

- [ ] **Step 1: Write the failing test**

Create `packages/coloring/src/data/book-page-label.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { deriveBookPageLabel, bookPageTone, type BookPageMetaInput } from "./book-page-label";

describe("deriveBookPageLabel", () => {
  const interior: BookPageMetaInput[] = [
    { sourcePageNumber: 12, origin: "original" },
    { origin: "additional", parentPageNumber: 12 },
    { origin: "additional", parentPageNumber: 12 },
    { origin: "additional", parentPageNumber: 8 },
    {}, // legacy page: no metadata
  ];

  it("labels an original by its inherited source page number", () => {
    expect(deriveBookPageLabel(interior[0], 0, interior)).toEqual({
      displayNumber: "#12",
      isAdditional: false,
    });
  });

  it("numbers additionals per-parent as #<parent>·A<n>", () => {
    expect(deriveBookPageLabel(interior[1], 1, interior).displayNumber).toBe("#12·A1");
    expect(deriveBookPageLabel(interior[2], 2, interior).displayNumber).toBe("#12·A2");
    expect(deriveBookPageLabel(interior[1], 1, interior).isAdditional).toBe(true);
  });

  it("restarts the A-counter for a different parent", () => {
    expect(deriveBookPageLabel(interior[3], 3, interior).displayNumber).toBe("#8·A1");
  });

  it("falls back to positional number when metadata is absent (pre-D4a books)", () => {
    expect(deriveBookPageLabel(interior[4], 4, interior)).toEqual({
      displayNumber: "#5",
      isAdditional: false,
    });
  });
});

describe("bookPageTone", () => {
  it("maps cover/intro sections regardless of page origin", () => {
    expect(bookPageTone("cover", {})).toBe("cover");
    expect(bookPageTone("intro", {})).toBe("intro");
  });
  it("splits interior by origin", () => {
    expect(bookPageTone("interior", { origin: "original" })).toBe("interior");
    expect(bookPageTone("interior", {})).toBe("interior");
    expect(bookPageTone("interior", { origin: "additional", parentPageNumber: 3 })).toBe("additional");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/coloring && yarn vitest run src/data/book-page-label.test.ts`
Expected: FAIL — module `./book-page-label` not found.

- [ ] **Step 3: Write the helper**

Create `packages/coloring/src/data/book-page-label.ts`:
```ts
export interface BookPageMetaInput {
  sourcePageNumber?: number;
  origin?: "original" | "additional";
  parentPageNumber?: number;
}

export interface BookPageLabel {
  displayNumber: string;
  isAdditional: boolean;
}

/** Visual tone for a page, driven by its section + (for interior) its origin. */
export type BookPageTone = "cover" | "intro" | "interior" | "additional";

/**
 * Display label for a book page. `index` is the page's position in `interior`
 * (the caller maps `interior.map((p, i) => deriveBookPageLabel(p, i, interior))`),
 * used both for the A<n> rank and the pre-D4a positional fallback.
 */
export function deriveBookPageLabel(
  page: BookPageMetaInput,
  index: number,
  interior: BookPageMetaInput[],
): BookPageLabel {
  if (page.origin === "additional" && page.parentPageNumber != null) {
    const parent = page.parentPageNumber;
    let rank = 0;
    for (let i = 0; i <= index; i++) {
      const q = interior[i];
      if (q && q.origin === "additional" && q.parentPageNumber === parent) rank++;
    }
    return { displayNumber: `#${parent}·A${rank}`, isAdditional: true };
  }
  if (page.sourcePageNumber != null) {
    return { displayNumber: `#${page.sourcePageNumber}`, isAdditional: false };
  }
  return { displayNumber: `#${index + 1}`, isAdditional: false };
}

/** Interior additional pages get the "additional" tone; everything else follows its section. */
export function bookPageTone(
  section: "cover" | "intro" | "interior",
  page: BookPageMetaInput,
): BookPageTone {
  if (section === "interior" && page.origin === "additional") return "additional";
  return section;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/coloring && yarn vitest run src/data/book-page-label.test.ts`
Expected: PASS (2 describe blocks, 6 assertions).

- [ ] **Step 5: Commit**

```bash
git add packages/coloring/src/data/book-page-label.ts packages/coloring/src/data/book-page-label.test.ts
git commit -m "feat(coloring): deriveBookPageLabel + bookPageTone helpers (D4a T-011)"
```

---

## Task 2: Persist page lineage — types + create-book stamping

**Files:**
- Modify: `packages/coloring/src/data/types.ts` (`BookColoringPage` ~140-151; `BookDetail.summaryPages` ~170)
- Modify: `packages/clone-core/src/steps/create-book.ts:38-48` (JobPage interface) and its `buildPage` (~113-123)
- Modify: `apps/admin/src/app/api/clone/[jobId]/create-book/route.ts:54-82` (`buildPage`)

**Interfaces:**
- Consumes: nothing from Task 1 (independent).
- Produces: `BookColoringPage` and `summaryPages[]` items now carry optional `sourcePageNumber?: number`, `origin?: "original" | "additional"`, `parentPageNumber?: number`. Both create-book paths write them.

- [ ] **Step 1: Add the fields to the coloring types**

In `packages/coloring/src/data/types.ts`, inside `interface BookColoringPage` (after `sceneData?: ...`):
```ts
  sceneData?: PageSceneData | Record<string, unknown> | string | null;
  /** D4a lineage carried from the clone JobPage (for the book's Number/Background badges). */
  sourcePageNumber?: number;
  origin?: "original" | "additional";
  parentPageNumber?: number;
```
And in `interface BookDetail`, change the `summaryPages` member to carry the source number:
```ts
  summaryPages?: { id: string; url: string; isPublic?: boolean; sourcePageNumber?: number }[];
```

- [ ] **Step 2: Stamp fields in the worker `create-book.ts`**

In `packages/clone-core/src/steps/create-book.ts`, extend the local `JobPage` interface (lines 38-48) with the lineage fields:
```ts
interface JobPage {
  pageNumber: number;
  imageUrl: string;
  redesignedUrl?: string;
  redesignPrompt?: string;
  rawData?: PageRawData;
  status?: string;
  error?: string;
  pageType?: "cover" | "interiorIntro" | "interior";
  excluded?: boolean;
  origin?: "original" | "additional";
  parentPageNumber?: number;
}
```
Then in `buildPage` (the object returned, ~lines 116-122), add the three fields after `sceneData`:
```ts
    return {
      id: deps.randomUUID(),
      url,
      isPublic: false,
      prompt: p.redesignPrompt || p.rawData?.reproductionPrompt || "",
      sceneData: normalizeRawData(p.rawData),
      sourcePageNumber: p.pageNumber,
      origin: p.origin ?? "original",
      ...(p.parentPageNumber != null ? { parentPageNumber: p.parentPageNumber } : {}),
    };
```
(This applies to both `coloringPages` and `summaryPages` since both call `buildPage`. Intro pages get `sourcePageNumber` + `origin: "original"`, which is correct.)

- [ ] **Step 3: Stamp fields in the admin `create-book/route.ts` (parity)**

In `apps/admin/src/app/api/clone/[jobId]/create-book/route.ts`, in `buildPage` (the returned object, ~lines 59-81), add the same three fields after `sceneData`:
```ts
      return {
        id: crypto.randomUUID(),
        url,
        isPublic: false,
        prompt: p.redesignPrompt || p.rawData?.reproductionPrompt || "",
        sceneData: p.rawData
          ? {
              scene: p.rawData.scene,
              environment: p.rawData.environment,
              characters: (p.rawData.characters || []).map((c) => ({
                name: c.name,
                type: c.type,
                role: c.role,
                characterPrompt: c.characterPrompt,
              })),
              locations: (p.rawData.locations || []).map((l) => ({
                name: l.name,
                description: l.description,
                locationPrompt: l.locationPrompt,
              })),
            }
          : undefined,
        sourcePageNumber: p.pageNumber,
        origin: p.origin ?? "original",
        ...(p.parentPageNumber != null ? { parentPageNumber: p.parentPageNumber } : {}),
      };
```
`CloneJobPage` (imported from `@vx/server-core/ai/clone-types`) already has `origin`/`parentPageNumber` (added in D3), so `p.origin`/`p.parentPageNumber` typecheck without further changes.

- [ ] **Step 4: Typecheck**

Run: `cd apps/admin && yarn typecheck`
Expected: no new errors vs baseline (`.next/dev/types/routes.d.ts` noise excepted).

- [ ] **Step 5: Reasoning check (no create-book test harness)**

Write into the commit body: new books get `sourcePageNumber` on every interior + intro page, `origin` ("original" default, "additional" for D3-filled pages), and `parentPageNumber` for additional pages. Old books lack these → the UI helper (Task 1) falls back to positional numbers. Both create-book paths emit identical shapes (parity).

- [ ] **Step 6: Commit**

```bash
git add packages/coloring/src/data/types.ts packages/clone-core/src/steps/create-book.ts \
  "apps/admin/src/app/api/clone/[jobId]/create-book/route.ts"
git commit -m "feat(clone): create-book stamps sourcePageNumber/origin/parent onto book pages (D4a T-011)"
```

---

## Task 3: Book-detail 3-section render + PageThumb tone/label

**Files:**
- Modify: `packages/coloring/src/screens/books/book-detail-screen.tsx` (`PageThumb` ~108-122; the `tab === "pages"` block ~424-435)

**Interfaces:**
- Consumes: `deriveBookPageLabel`, `bookPageTone`, `BookPageTone` from `../../data/book-page-label` (Task 1); the new page fields on `BookColoringPage` + `summaryPages` (Task 2).
- Produces: no new exports (UI only).

- [ ] **Step 1: Import the helpers**

In `packages/coloring/src/screens/books/book-detail-screen.tsx`, add after the `types` import (line 26):
```ts
import { deriveBookPageLabel, bookPageTone, type BookPageTone } from "../../data/book-page-label";
```

- [ ] **Step 2: Add a tone→style map near the top**

After the `CAP` const (line 66), add:
```ts
const TONE_STYLE: Record<BookPageTone, { border: string; bg?: string; label: string }> = {
  cover:      { border: "var(--info)",    bg: "var(--info-bg)",    label: "Cover" },
  intro:      { border: "var(--volt-500)", bg: "var(--volt-200)",  label: "Intro" },
  interior:   { border: "var(--border)",                            label: "Interior" },
  additional: { border: "var(--warning)", bg: "color-mix(in srgb, var(--warning) 14%, var(--neutral-100))", label: "Additional" },
};
```

- [ ] **Step 3: Rewrite `PageThumb` to take a label + tone**

Replace the whole `PageThumb` function (lines 108-122) with:
```tsx
function PageThumb({ page, displayNumber, tone, onClick }: { page: BookColoringPage; displayNumber: string; tone: BookPageTone; onClick?: () => void }) {
  const src = resolveImg(page.coloredUrl || page.url);
  const t = TONE_STYLE[tone];
  return (
    <div onClick={onClick} className="mo-bookthumb" style={{ cursor: onClick ? "pointer" : "default", aspectRatio: "1 / 1", borderRadius: "var(--radius-sm)", background: t.bg ?? "var(--neutral-100)", border: `1px solid ${t.border}`, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)", overflow: "hidden" }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={displayNumber} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <Icon name="image" size={18} />
      )}
      <span style={{ position: "absolute", left: 6, bottom: 4, ...mono, fontSize: 10, color: "#fff", background: "rgba(11,13,12,.6)", padding: "0 4px", borderRadius: 4 }}>{displayNumber}</span>
      {page.coloredUrl && <span style={{ position: "absolute", right: 5, top: 5, background: "var(--volt-500)", color: "var(--carbon-950)", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99 }}>MÀU</span>}
    </div>
  );
}
```

- [ ] **Step 4: Add a small section-header component**

Immediately after the new `PageThumb`, add:
```tsx
function PageSection({ tone, count, children }: { tone: BookPageTone; count: number; children: ReactNode }) {
  const t = TONE_STYLE[tone];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: t.border }} />
        <span style={{ ...cap }}>{t.label}</span>
        <span style={{ ...mono, fontSize: 12, color: "var(--muted-foreground)" }}>{count}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 10 }}>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Rewrite the `tab === "pages"` block into 3 sections**

Replace the `tab === "pages" ? (...)` branch (lines ~424-435) with:
```tsx
          ) : tab === "pages" ? (
            <Card title={`Trang sách · ${pages.length}`}>
              {pages.length === 0 && (b.summaryPages ?? []).length === 0 && !cover ? (
                <EmptyState icon="image" title="Chưa có trang" sub="Sách này chưa có trang tô màu." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {cover && (
                    <PageSection tone="cover" count={1}>
                      <PageThumb
                        page={{ id: "cover", url: b.coverUrl ?? "" } as BookColoringPage}
                        displayNumber="Bìa"
                        tone="cover"
                        onClick={openCoverPreview}
                      />
                    </PageSection>
                  )}
                  {(b.summaryPages ?? []).length > 0 && (
                    <PageSection tone="intro" count={(b.summaryPages ?? []).length}>
                      {(b.summaryPages ?? []).map((s, i) => (
                        <PageThumb
                          key={s.id || i}
                          page={{ id: s.id, url: s.url, isPublic: s.isPublic } as BookColoringPage}
                          displayNumber={s.sourcePageNumber != null ? `#${s.sourcePageNumber}` : `#${i + 1}`}
                          tone="intro"
                          onClick={() => { setPreviewPage(null); setPreview({ title: `Intro ${i + 1}`, imageSrc: resolveImg(s.url) }); }}
                        />
                      ))}
                    </PageSection>
                  )}
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
                </div>
              )}
            </Card>
          ) : (
```

- [ ] **Step 6: Typecheck + coloring tests**

Run: `cd apps/admin && yarn typecheck` (expect no new errors)
Run: `cd packages/coloring && yarn vitest run` (expect the full suite green, incl. `book-page-label.test.ts`)

- [ ] **Step 7: Manual verification (dev, staging write enabled)**

With the app running, open a book detail → tab "Trang sách": three sections appear (Cover blue, Intro gold, Interior). A NEW book (created after Task 2) shows inherited `#N` numbers and orange additional thumbnails; an OLD book shows positional `#N` with default tone (no crash). Originals keep the existing 4-badge behaviour untouched.

- [ ] **Step 8: Commit**

```bash
git add packages/coloring/src/screens/books/book-detail-screen.tsx
git commit -m "feat(coloring): book-detail Cover/Intro/Interior sections + Number/Background badges (D4a T-010/011)"
```

---

## Self-Review

**Spec coverage (`2026-08-11-d4a-book-ordering-visual-design.md`):**
- §3 types (3 optional fields on BookColoringPage + summaryPages) → Task 2 Step 1. ✅
- §4 derive helper + fallback + tone mapping → Task 1. ✅
- §5 create-book stamping (worker + admin parity) → Task 2 Steps 2-3. ✅
- §6 UI 3 sections + PageThumb label/tone (book-detail only) → Task 3. ✅
- Q1 inherited source number → `deriveBookPageLabel` uses `sourcePageNumber`; create-book stamps `p.pageNumber`. ✅
- Q2 no backfill / graceful degrade → helper fallback `#{index+1}`; fields optional. ✅
- Q3 book-detail only → Task 3 touches only `book-detail-screen.tsx`. ✅
- Tone tokens pinned (Cover `--info`, Intro `--volt-500`, additional `--warning`) per Global Constraints. ✅

**Placeholder scan:** every code step has full code; test step has real cases + expected output; the tone map has concrete CSS values. No TBD/TODO. ✅

**Type consistency:** `deriveBookPageLabel(page, index, interior)` and `bookPageTone(section, page)` signatures identical in Task 1 (def) and Task 3 (use). `BookPageTone` union identical in Task 1, `TONE_STYLE` (Task 3), and `PageThumb`/`PageSection` props (Task 3). Field names `sourcePageNumber`/`origin`/`parentPageNumber` identical across Task 2 (types + both create-book paths) and consumed in Task 3. `origin: "original" | "additional"` matches D3's existing `CloneJobPage.origin`. ✅
