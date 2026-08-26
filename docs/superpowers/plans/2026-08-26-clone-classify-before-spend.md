# Clone pipeline — classify before spend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move page classification and the operator gate ahead of the Diaflow call so the pipeline only pays to redesign pages it will keep, and route sub-40-interior jobs into a parked lane that spends nothing.

**Architecture:** `stepRender` already writes a PNG of every page to R2 at zero token cost. The operator gate moves to sit right after it, where the operator assigns `pageType` to all three groups and marks pages to drop. A new pure planner turns those marks into a kept-page list, an interior count, and a lane. Lane 1 builds a trimmed PDF containing only kept pages and sends *that* to Diaflow; Lane 2 parks. Dropped pages stay in `job.pages` with their rendered original, so the exported "Main book" is still the complete source book.

**Tech Stack:** TypeScript, Vitest, Prisma, BullMQ, Next.js App Router, `pdf-lib` (new to `@vx/server-core`), `pdfjs-dist` (existing).

**Spec:** `docs/superpowers/specs/2026-08-26-clone-pipeline-cost-design.md`

## Global Constraints

- **Dropping a page is clone-scoped only.** The exported `Main book/` folders must always contain every source page — cover, intro, and interior. Only the clone Book and the Diaflow input honour the drop flag.
- **No page cap.** Never trim a book to a target length. Source books keep their length.
- **Lane 1 = interior ≥ 40. Lane 2 = interior < 40** and must not reach any AI call.
- **A page with no `pageType` counts as `interior`** — this is the existing legacy rule in `create-book.ts:110` and must not change.
- Steps in `@vx/clone-core` take injected deps; they never import `@vx/server-core` directly. Real wiring lives in `apps/worker/src/processor/step-deps.ts`.
- `@vx/clone-core` uses relative imports, not the `@/` alias.
- Tests are co-located: `foo.test.ts` next to `foo.ts`.
- Never run `prisma db push`, `prisma migrate`, or `prisma db seed` — `localhost:5432` is tunnelled to production.

---

### Task 1: Export preserves the complete original book

Fixes W15. Independent of every other task — ship it first.

**Files:**
- Modify: `packages/server-core/src/book-export/build-export-zip.ts:54`
- Test: `packages/server-core/src/book-export/build-export-zip.test.ts:33,55-66`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks depend on. `collectExportPlan(input: ExportInput): ExportPlan` keeps its exact signature.

- [ ] **Step 1: Update the two tests that assert the old behaviour**

In `build-export-zip.test.ts`, replace the interior assertion inside `"lays out Main book + Clone book folders with expected entry counts"` (currently line 33-34):

```ts
    // Main book is the archived ORIGINAL: it keeps every source page,
    // including ones the operator dropped from cloning.
    expect(byPath["Main book/Book interior"].map((e) => e.url)).toEqual([
      "/assets/src/p3.png",
      "/assets/src/p4.png",
    ]);
```

Then replace the whole `"cover fallback skips an excluded first source page"` test with:

```ts
  it("cover fallback takes the first source page even if it was dropped from cloning", () => {
    const plan = collectExportPlan({
      ...baseInput,
      cloneJobPages: [
        { imageUrl: "/assets/src/dropped.png", excludedFromClone: true },
        { imageUrl: "/assets/src/second.png" },
      ],
    });
    const cover = plan.folders.find((f) => f.path === "Main book/Book cover")!;
    expect(cover.entries.map((e) => e.url)).toEqual(["/assets/src/dropped.png"]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn workspace @vx/server-core vitest run src/book-export/build-export-zip.test.ts`
Expected: FAIL — interior returns only `p3.png`, and the cover fallback returns `second.png`.

- [ ] **Step 3: Remove the drop filter from the Main book section**

In `build-export-zip.ts`, replace lines 53-61 (the block starting `const jobPages = input.cloneJobPages;`) with:

```ts
    const jobPages = input.cloneJobPages;
    // Main book is the archived ORIGINAL source book. It is NOT filtered by the
    // clone-drop flag: a page the operator kept out of the clone must still be
    // present here, or the archive silently loses pages from the source.
    let coverPages = jobPages.filter((p) => p.pageType === "cover");
    if (coverPages.length === 0 && jobPages[0]) coverPages = [jobPages[0]];
    const introPages = jobPages.filter((p) => p.pageType === "interiorIntro");
    const coverSet = new Set(coverPages);
    const introSet = new Set(introPages);
    const interiorPages = jobPages.filter((p) => !coverSet.has(p) && !introSet.has(p));
```

Then add the new field to `ExportPageLike` (currently `build-export-zip.ts:5-11`) so the type stays honest, keeping `excluded` for older rows:

```ts
export type ExportPageLike = {
  url?: string;
  coloredUrl?: string;
  imageUrl?: string;
  pageType?: string;
  /** Legacy D2 flag. No longer read here — Main book keeps every page. */
  excluded?: boolean;
  /** Operator drop mark. No longer read here — Main book keeps every page. */
  excludedFromClone?: boolean;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn workspace @vx/server-core vitest run src/book-export/build-export-zip.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add packages/server-core/src/book-export/build-export-zip.ts packages/server-core/src/book-export/build-export-zip.test.ts
git commit -m "fix(export): keep every source page in Main book archive"
```

---

### Task 2: `excludedFromClone` replaces the overloaded `excluded` flag

Splits the flag so Task 1's guarantee cannot regress. Reads both fields so existing rows keep working; writes only the new one.

**Files:**
- Modify: `packages/server-core/src/ai/clone-types.ts:71`
- Modify: `packages/clone-core/src/steps/create-book.ts:104`
- Test: `packages/clone-core/src/steps/create-book.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CloneJobPage.excludedFromClone?: boolean` — read by Tasks 3, 5, 7, 8. The read rule every consumer must use is `p.excludedFromClone ?? p.excluded ?? false`.

- [ ] **Step 1: Write the failing test**

Append a new `describe` block to `packages/clone-core/src/steps/create-book.test.ts`. `fakeDb()` in that file takes no arguments and hardcodes its job, so override it with `mockResolvedValueOnce` — the same pattern the existing `"recovers rawData stored as a JSON string"` test uses at line 82:

```ts
describe("stepCreateBook — clone-drop flag", () => {
  const deps = {
    randomUUID: () => "uuid-1",
    copyImage: async ({ destKey }: { sourceUrl: string; destKey: string }) => `/${destKey}`,
  };

  it("drops pages marked excludedFromClone from the built Book", async () => {
    const { db, created } = fakeDb();
    (db as { cloneJob: { findUnique: ReturnType<typeof vi.fn> } }).cloneJob.findUnique.mockResolvedValueOnce({
      id: "j1",
      name: "MyBook",
      bookData: { title: "MyBook" },
      pages: [
        { pageNumber: 1, imageUrl: "/a.png", redesignedUrl: "/ra.png", pageType: "interior" },
        { pageNumber: 2, imageUrl: "/b.png", redesignedUrl: "/rb.png", pageType: "interior", excludedFromClone: true },
        { pageNumber: 3, imageUrl: "/c.png", redesignedUrl: "/rc.png", pageType: "interior" },
      ],
    });

    await stepCreateBook(fakeCtx("j1"), db, deps);

    const book = created[0].data as { coloringPages: Array<{ sourcePageNumber: number }> };
    expect(book.coloringPages.map((p) => p.sourcePageNumber)).toEqual([1, 3]);
  });

  it("still honours the legacy `excluded` flag on old rows", async () => {
    const { db, created } = fakeDb();
    (db as { cloneJob: { findUnique: ReturnType<typeof vi.fn> } }).cloneJob.findUnique.mockResolvedValueOnce({
      id: "j1",
      name: "MyBook",
      bookData: { title: "MyBook" },
      pages: [
        { pageNumber: 1, imageUrl: "/a.png", redesignedUrl: "/ra.png", pageType: "interior" },
        { pageNumber: 2, imageUrl: "/b.png", redesignedUrl: "/rb.png", pageType: "interior", excluded: true },
      ],
    });

    await stepCreateBook(fakeCtx("j1"), db, deps);

    const book = created[0].data as { coloringPages: Array<{ sourcePageNumber: number }> };
    expect(book.coloringPages.map((p) => p.sourcePageNumber)).toEqual([1]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @vx/clone-core vitest run src/steps/create-book.test.ts`
Expected: FAIL — the `excludedFromClone` page is still included (3 pages, not 2).

- [ ] **Step 3: Add the field and read both flags**

In `packages/server-core/src/ai/clone-types.ts`, replace line 70-71:

```ts
  /** Legacy D2 inclusion flag. Superseded by excludedFromClone; still read for old rows. */
  excluded?: boolean;
  /**
   * Operator drop mark set at the pre-spend gate. True = do NOT send this page
   * to Diaflow and do NOT put it in the clone Book. It has NO effect on the
   * exported "Main book" archive, which always keeps every source page.
   */
  excludedFromClone?: boolean;
```

In `packages/clone-core/src/steps/create-book.ts`, add the field to the local `JobPage` type next to the existing `excluded?: boolean;` at line 47:

```ts
  excludedFromClone?: boolean;
```

and replace the filter at line 103-105:

```ts
  // A page is usable if it isn't an error page and has an image. Pages the
  // operator dropped at the gate never reach the clone Book. `excluded` is the
  // legacy name for the same mark and is still honoured on pre-existing rows.
  const usablePages = pages.filter(
    (p) =>
      p.status !== "error" &&
      !(p.excludedFromClone ?? p.excluded ?? false) &&
      (p.redesignedUrl || p.imageUrl),
  );
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @vx/clone-core vitest run src/steps/create-book.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server-core/src/ai/clone-types.ts packages/clone-core/src/steps/create-book.ts packages/clone-core/src/steps/create-book.test.ts
git commit -m "feat(clone): split excludedFromClone out of the overloaded excluded flag"
```

---

### Task 3: `planPageSelection` — pure lane router

The whole routing decision as one pure, unit-tested function. No I/O.

**Files:**
- Create: `packages/clone-core/src/steps/plan-page-selection.ts`
- Create: `packages/clone-core/src/steps/plan-page-selection.test.ts`
- Modify: `packages/clone-core/src/steps/index.ts`

**Interfaces:**
- Consumes: `CloneJobPage.excludedFromClone` from Task 2.
- Produces:
  - `LANE1_MIN_INTERIOR: 40`
  - `type SelectablePage = { pageNumber: number; pageType?: "cover" | "interiorIntro" | "interior"; excludedFromClone?: boolean; excluded?: boolean }`
  - `type PageSelection = { keptPageNumbers: number[]; interiorCount: number; lane: 1 | 2 }`
  - `planPageSelection(pages: SelectablePage[], minInterior?: number): PageSelection`
  - Used by Tasks 4, 5, 6, 7.

- [ ] **Step 1: Write the failing test**

Create `packages/clone-core/src/steps/plan-page-selection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planPageSelection, LANE1_MIN_INTERIOR, type SelectablePage } from "./plan-page-selection";

const interiors = (n: number, from = 1): SelectablePage[] =>
  Array.from({ length: n }, (_, i) => ({ pageNumber: from + i, pageType: "interior" as const }));

describe("planPageSelection", () => {
  it("40 interiors → lane 1, every page kept", () => {
    const sel = planPageSelection(interiors(40));
    expect(sel.lane).toBe(1);
    expect(sel.interiorCount).toBe(40);
    expect(sel.keptPageNumbers).toHaveLength(40);
  });

  it("39 interiors → lane 2", () => {
    expect(planPageSelection(interiors(39)).lane).toBe(2);
  });

  it("cover and intro pages are kept but do not count toward interior", () => {
    const pages: SelectablePage[] = [
      { pageNumber: 1, pageType: "cover" },
      { pageNumber: 2, pageType: "interiorIntro" },
      ...interiors(40, 3),
    ];
    const sel = planPageSelection(pages);
    expect(sel.interiorCount).toBe(40);
    expect(sel.lane).toBe(1);
    // cover + intro still go to Diaflow — create-book needs their redesigns
    expect(sel.keptPageNumbers).toHaveLength(42);
    expect(sel.keptPageNumbers[0]).toBe(1);
  });

  it("dropped pages are excluded from keptPageNumbers and from the interior count", () => {
    const pages: SelectablePage[] = [
      ...interiors(40),
      { pageNumber: 41, pageType: "interior", excludedFromClone: true },
      { pageNumber: 42, pageType: "interior", excludedFromClone: true },
    ];
    const sel = planPageSelection(pages);
    expect(sel.keptPageNumbers).toHaveLength(40);
    expect(sel.keptPageNumbers).not.toContain(41);
    expect(sel.interiorCount).toBe(40);
  });

  it("dropping interiors can push a job from lane 1 into lane 2", () => {
    const pages: SelectablePage[] = [
      ...interiors(40),
      { pageNumber: 1, pageType: "interior", excludedFromClone: true },
    ].map((p, i) => ({ ...p, pageNumber: i + 1 }));
    const sel = planPageSelection(pages);
    expect(sel.interiorCount).toBe(40);
    expect(sel.lane).toBe(1);
    const dropped = planPageSelection(
      interiors(40).map((p, i) => (i === 0 ? { ...p, excludedFromClone: true } : p)),
    );
    expect(dropped.interiorCount).toBe(39);
    expect(dropped.lane).toBe(2);
  });

  it("a page with no pageType counts as interior (legacy rule)", () => {
    const pages: SelectablePage[] = Array.from({ length: 40 }, (_, i) => ({ pageNumber: i + 1 }));
    expect(planPageSelection(pages).interiorCount).toBe(40);
  });

  it("honours the legacy `excluded` flag", () => {
    const pages = interiors(40).map((p, i) => (i === 0 ? { ...p, excluded: true } : p));
    expect(planPageSelection(pages).keptPageNumbers).toHaveLength(39);
  });

  it("keptPageNumbers is ascending regardless of input order", () => {
    const sel = planPageSelection([
      { pageNumber: 3, pageType: "interior" },
      { pageNumber: 1, pageType: "interior" },
      { pageNumber: 2, pageType: "interior" },
    ]);
    expect(sel.keptPageNumbers).toEqual([1, 2, 3]);
  });

  it("exports the documented threshold", () => {
    expect(LANE1_MIN_INTERIOR).toBe(40);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @vx/clone-core vitest run src/steps/plan-page-selection.test.ts`
Expected: FAIL — `Cannot find module './plan-page-selection'`.

- [ ] **Step 3: Write the implementation**

Create `packages/clone-core/src/steps/plan-page-selection.ts`:

```ts
/** Interior pages required before a job may enter the paid pipeline. */
export const LANE1_MIN_INTERIOR = 40;

export interface SelectablePage {
  pageNumber: number;
  /** undefined = legacy page, treated as "interior" (matches create-book). */
  pageType?: "cover" | "interiorIntro" | "interior";
  /** Operator drop mark from the gate. */
  excludedFromClone?: boolean;
  /** Legacy name for the same mark. */
  excluded?: boolean;
}

export interface PageSelection {
  /** Original page numbers to send to Diaflow, ascending. */
  keptPageNumbers: number[];
  /** Kept pages that count as interior — the value lane routing keys on. */
  interiorCount: number;
  /** 1 = enough interiors to run now. 2 = park, needs page generation first. */
  lane: 1 | 2;
}

const isDropped = (p: SelectablePage): boolean =>
  p.excludedFromClone ?? p.excluded ?? false;

const isInterior = (p: SelectablePage): boolean =>
  p.pageType !== "cover" && p.pageType !== "interiorIntro";

/**
 * Turn the operator's gate decisions into the routing outcome.
 *
 * Cover and intro pages are KEPT — `stepCreateBook` needs their redesigned
 * versions for `coverUrl` and `summaryPages` — but they do not count toward
 * the interior total that decides the lane. Only pages the operator dropped
 * are withheld from Diaflow.
 *
 * Pure and total: no I/O, no clock, no randomness.
 */
export function planPageSelection(
  pages: SelectablePage[],
  minInterior: number = LANE1_MIN_INTERIOR,
): PageSelection {
  const kept = pages.filter((p) => !isDropped(p));
  const keptPageNumbers = kept
    .map((p) => p.pageNumber)
    .sort((a, b) => a - b);
  const interiorCount = kept.filter(isInterior).length;
  return {
    keptPageNumbers,
    interiorCount,
    lane: interiorCount >= minInterior ? 1 : 2,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @vx/clone-core vitest run src/steps/plan-page-selection.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Export it from the barrel**

Append to `packages/clone-core/src/steps/index.ts`:

```ts
export {
  planPageSelection,
  LANE1_MIN_INTERIOR,
  type SelectablePage,
  type PageSelection,
} from "./plan-page-selection";
```

- [ ] **Step 6: Commit**

```bash
git add packages/clone-core/src/steps/plan-page-selection.ts packages/clone-core/src/steps/plan-page-selection.test.ts packages/clone-core/src/steps/index.ts
git commit -m "feat(clone): add planPageSelection lane router"
```

---

### Task 4: `stepTrimPdf` — build the Diaflow input from kept pages only

**Files:**
- Create: `packages/clone-core/src/steps/trim-pdf.ts`
- Create: `packages/clone-core/src/steps/trim-pdf.test.ts`
- Modify: `packages/clone-core/src/types.ts:1-22`
- Modify: `packages/clone-core/src/steps/index.ts`
- Create: `packages/server-core/src/pdf-trim.ts`
- Modify: `packages/server-core/package.json`
- Modify: `apps/worker/src/processor/step-deps.ts`

**Interfaces:**
- Consumes: `planPageSelection` from Task 3.
- Produces:
  - `CloneStep` gains `"trim-pdf"`, inserted in `STEP_ORDER` between `"render"` and `"analyze"`.
  - `stepTrimPdf(ctx: JobContext, db: PrismaClient, deps: TrimPdfDeps): Promise<void>` — writes `job.data.trimmedPdfUrl: string` and `job.data.keptPageNumbers: number[]`, then marks `"trim-pdf"` complete. Task 5 reads both.
  - `TrimPdfDeps = { readPdfFromR2(key: string): Promise<Buffer>; copyPdfPages(pdf: Uint8Array, keepIndices: number[]): Promise<Uint8Array>; uploadToR2(a: { key: string; body: Buffer; contentType: string }): Promise<{ url: string }> }`
  - `copyPdfPages` exported from `@vx/server-core/pdf-trim`.

- [ ] **Step 1: Add the new step to the step order**

In `packages/clone-core/src/types.ts`, replace the `CloneStep` union and `STEP_ORDER` (lines 1-22):

```ts
export type CloneStep =
  | "download"
  | "render"
  | "trim-pdf"
  | "analyze"
  | "extract-entities"
  | "reproduce"
  | "fill-interior"
  | "create-book"
  | "generate-cover";

export const STEP_ORDER: readonly CloneStep[] = [
  "download",
  "render",
  "trim-pdf",
  "analyze",
  "extract-entities",
  "reproduce",
  "fill-interior",
  "create-book",
  "generate-cover",
] as const;
```

`JobContext.isDone` compares positions in this array, so an in-order insert is safe: a legacy job whose `currentStep` is `"reproduce"` still reports `isDone("trim-pdf") === true` and will not re-run it.

- [ ] **Step 2: Write the failing test**

Create `packages/clone-core/src/steps/trim-pdf.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { stepTrimPdf } from "./trim-pdf";

function fakeCtx(jobId: string) {
  return {
    jobId,
    isDone: vi.fn().mockReturnValue(false),
    markStepComplete: vi.fn().mockResolvedValue(undefined),
  } as never;
}

function fakeDb(job: Record<string, unknown>) {
  const updates: Record<string, unknown>[] = [];
  return {
    updates,
    db: {
      cloneJob: {
        findUnique: vi.fn().mockResolvedValue(job),
        updateMany: vi.fn().mockImplementation(async (arg: { data: unknown }) => {
          updates.push(arg.data as Record<string, unknown>);
        }),
      },
    } as never,
  };
}

const fakeDeps = () => ({
  readPdfFromR2: vi.fn().mockResolvedValue(Buffer.from("pdf-bytes")),
  copyPdfPages: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  uploadToR2: vi.fn().mockResolvedValue({ url: "/assets/clone-jobs/job-1/source-trimmed.pdf" }),
});

const pages = [
  { pageNumber: 1, pageType: "cover" },
  { pageNumber: 2, pageType: "interior" },
  { pageNumber: 3, pageType: "interior", excludedFromClone: true },
  { pageNumber: 4, pageType: "interior" },
];

describe("stepTrimPdf", () => {
  it("copies only kept pages, converting 1-based page numbers to 0-based indices", async () => {
    const { db } = fakeDb({ id: "job-1", sourcePdfUrl: "/assets/clone-jobs/job-1/source.pdf", pages, data: {} });
    const deps = fakeDeps();
    await stepTrimPdf(fakeCtx("job-1"), db, deps);
    expect(deps.copyPdfPages).toHaveBeenCalledWith(expect.anything(), [0, 1, 3]);
  });

  it("persists the trimmed url and the kept-page map", async () => {
    const { db, updates } = fakeDb({ id: "job-1", sourcePdfUrl: "/assets/clone-jobs/job-1/source.pdf", pages, data: { brand: "X" } });
    await stepTrimPdf(fakeCtx("job-1"), db, fakeDeps());
    const data = updates[0].data as Record<string, unknown>;
    expect(data.trimmedPdfUrl).toBe("/assets/clone-jobs/job-1/source-trimmed.pdf");
    expect(data.keptPageNumbers).toEqual([1, 2, 4]);
    expect(data.brand).toBe("X"); // preserves unrelated keys
  });

  it("skips the copy entirely when nothing was dropped", async () => {
    const allKept = [
      { pageNumber: 1, pageType: "interior" },
      { pageNumber: 2, pageType: "interior" },
    ];
    const { db, updates } = fakeDb({ id: "job-1", sourcePdfUrl: "/s.pdf", pages: allKept, data: {} });
    const deps = fakeDeps();
    await stepTrimPdf(fakeCtx("job-1"), db, deps);
    expect(deps.copyPdfPages).not.toHaveBeenCalled();
    expect(deps.uploadToR2).not.toHaveBeenCalled();
    const data = updates[0].data as Record<string, unknown>;
    expect(data.trimmedPdfUrl).toBe("/s.pdf");
    expect(data.keptPageNumbers).toEqual([1, 2]);
  });

  it("throws when the job has no sourcePdfUrl", async () => {
    const { db } = fakeDb({ id: "job-1", sourcePdfUrl: null, pages, data: {} });
    await expect(stepTrimPdf(fakeCtx("job-1"), db, fakeDeps())).rejects.toThrow(/sourcePdfUrl/);
  });

  it("marks the step complete", async () => {
    const ctx = fakeCtx("job-1");
    const { db } = fakeDb({ id: "job-1", sourcePdfUrl: "/s.pdf", pages, data: {} });
    await stepTrimPdf(ctx, db, fakeDeps());
    expect((ctx as unknown as { markStepComplete: ReturnType<typeof vi.fn> }).markStepComplete)
      .toHaveBeenCalledWith("trim-pdf");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `yarn workspace @vx/clone-core vitest run src/steps/trim-pdf.test.ts`
Expected: FAIL — `Cannot find module './trim-pdf'`.

- [ ] **Step 4: Write the step**

Create `packages/clone-core/src/steps/trim-pdf.ts`:

```ts
import type { PrismaClient } from "@vx/db";
import type { JobContext } from "../job-context";
import { planPageSelection, type SelectablePage } from "./plan-page-selection";

export interface TrimPdfDeps {
  readPdfFromR2: (key: string) => Promise<Buffer>;
  /** Copies `keepIndices` (0-based) out of a PDF into a new one. */
  copyPdfPages: (pdf: Uint8Array, keepIndices: number[]) => Promise<Uint8Array>;
  uploadToR2: (args: { key: string; body: Buffer; contentType: string }) => Promise<{ url: string }>;
}

/**
 * Build the PDF that actually goes to Diaflow: the source minus every page the
 * operator dropped at the gate. Runs AFTER the gate and BEFORE stepOneShot, so
 * dropped pages never cost a generation.
 *
 * Writes two values other steps depend on:
 *   data.trimmedPdfUrl   — what stepOneShot sends
 *   data.keptPageNumbers — index map back to ORIGINAL page numbers, because the
 *                          trimmed PDF renumbers its pages 1..N
 *
 * When nothing was dropped it skips the copy and points at the original PDF,
 * so the common case costs no extra R2 round-trip.
 */
export async function stepTrimPdf(
  ctx: JobContext,
  db: PrismaClient,
  deps: TrimPdfDeps,
): Promise<void> {
  const job = await db.cloneJob.findUnique({ where: { id: ctx.jobId } });
  if (!job) throw new Error(`cloneJob ${ctx.jobId} missing`);
  if (!job.sourcePdfUrl) {
    throw new Error(`cloneJob ${ctx.jobId} has no sourcePdfUrl (run stepDownload/stepRender first)`);
  }

  const pages = (job.pages as SelectablePage[] | null | undefined) ?? [];
  const { keptPageNumbers } = planPageSelection(pages);
  const prevData = (job.data as Record<string, unknown> | null | undefined) ?? {};

  let trimmedPdfUrl = job.sourcePdfUrl;
  if (keptPageNumbers.length !== pages.length) {
    const pdfKey = job.sourcePdfUrl.replace(/^\//, "");
    const buffer = await deps.readPdfFromR2(pdfKey);
    const keepIndices = keptPageNumbers.map((n) => n - 1);
    const trimmed = await deps.copyPdfPages(new Uint8Array(buffer), keepIndices);
    const key = `assets/clone-jobs/${ctx.jobId}/source-trimmed.pdf`;
    const { url } = await deps.uploadToR2({
      key,
      body: Buffer.from(trimmed),
      contentType: "application/pdf",
    });
    trimmedPdfUrl = url;
  }

  await db.cloneJob.updateMany({
    where: { id: ctx.jobId },
    data: { data: { ...prevData, trimmedPdfUrl, keptPageNumbers } as never },
  });

  await ctx.markStepComplete("trim-pdf");
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn workspace @vx/clone-core vitest run src/steps/trim-pdf.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Export from the barrel**

Append to `packages/clone-core/src/steps/index.ts`:

```ts
export { stepTrimPdf, type TrimPdfDeps } from "./trim-pdf";
```

- [ ] **Step 7: Add the real `copyPdfPages` in server-core**

Add `pdf-lib` to `packages/server-core/package.json` dependencies:

```json
    "pdf-lib": "^1.17.1",
```

Then run `yarn install`.

Create `packages/server-core/src/pdf-trim.ts`:

```ts
import { PDFDocument } from "pdf-lib";

/**
 * Copy a subset of pages out of a PDF into a new document.
 *
 * `keepIndices` are 0-based and are applied in the order given, so the output
 * page order follows the caller's list. Callers that need ascending order must
 * sort before calling.
 */
export async function copyPdfPages(
  pdf: Uint8Array,
  keepIndices: number[],
): Promise<Uint8Array> {
  const src = await PDFDocument.load(pdf);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, keepIndices);
  for (const page of copied) out.addPage(page);
  return out.save();
}
```

Add the subpath export to `packages/server-core/package.json` `exports`, matching the existing entries:

```json
    "./pdf-trim": "./src/pdf-trim.ts",
```

- [ ] **Step 8: Wire the deps in the worker**

In `apps/worker/src/processor/step-deps.ts`, add the import next to the existing `pdf-renderer` import:

```ts
import { copyPdfPages } from "@vx/server-core/pdf-trim";
```

and add the exported deps object next to `renderDeps`:

```ts
export const trimPdfDeps = { readPdfFromR2, copyPdfPages, uploadToR2 };
```

- [ ] **Step 9: Verify the workspace typechecks**

Run: `yarn workspace @vx/clone-core typecheck && yarn workspace @vx/worker typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add packages/clone-core/src/types.ts packages/clone-core/src/steps/trim-pdf.ts packages/clone-core/src/steps/trim-pdf.test.ts packages/clone-core/src/steps/index.ts packages/server-core/src/pdf-trim.ts packages/server-core/package.json apps/worker/src/processor/step-deps.ts yarn.lock
git commit -m "feat(clone): add stepTrimPdf so dropped pages never reach Diaflow"
```

---

### Task 5: `stepOneShot` consumes the trimmed PDF and merges results back

Three changes: send the trimmed PDF, map Diaflow's renumbered output back to original page numbers, and merge into `job.pages` instead of replacing it so dropped pages survive for the export.

**Files:**
- Modify: `packages/clone-core/src/steps/one-shot.ts:105-116,150-260,318-330`
- Test: `packages/clone-core/src/steps/one-shot.test.ts`

**Interfaces:**
- Consumes: `data.trimmedPdfUrl` and `data.keptPageNumbers` from Task 4.
- Produces: `job.pages` where kept pages carry `redesignedUrl` + `rawData` and dropped pages are untouched. Task 6 reads nothing new from it.

- [ ] **Step 1: Write the failing tests**

Append to `packages/clone-core/src/steps/one-shot.test.ts`:

```ts
describe("stepOneShot with a trimmed PDF", () => {
  const jobPages = [
    { pageNumber: 1, imageUrl: "/p1.png", status: "pending", pageType: "cover" },
    { pageNumber: 2, imageUrl: "/p2.png", status: "pending", pageType: "interior", excludedFromClone: true },
    { pageNumber: 3, imageUrl: "/p3.png", status: "pending", pageType: "interior" },
  ];

  const twoPageDeps = () => ({
    ...fakeDeps(),
    runOneShot: vi.fn().mockResolvedValue({
      sessionId: "sess-1",
      pages: [
        { redesignedImageUrl: "https://cdn/r-a.png", analyzeData: { reproductionPrompt: "a" } },
        { redesignedImageUrl: "https://cdn/r-b.png", analyzeData: { reproductionPrompt: "b" } },
      ],
    }),
  });

  it("sends the trimmed PDF, not the original", async () => {
    const { db } = fakeDb({
      id: "job-1",
      sourcePdfUrl: "/source.pdf",
      pages: jobPages,
      data: { trimmedPdfUrl: "/source-trimmed.pdf", keptPageNumbers: [1, 3] },
      bookData: {},
    });
    const deps = twoPageDeps();
    await stepOneShot(fakeCtx("job-1"), db, deps);
    expect(deps.runOneShot).toHaveBeenCalledWith("/source-trimmed.pdf", "job-1", undefined);
  });

  it("maps Diaflow output back onto original page numbers", async () => {
    const { db, updates } = fakeDb({
      id: "job-1",
      sourcePdfUrl: "/source.pdf",
      pages: jobPages,
      data: { trimmedPdfUrl: "/source-trimmed.pdf", keptPageNumbers: [1, 3] },
      bookData: {},
    });
    await stepOneShot(fakeCtx("job-1"), db, twoPageDeps());
    const written = updates.find((u) => Array.isArray((u as { pages?: unknown }).pages)) as { pages: Array<Record<string, unknown>> };
    const byNumber = Object.fromEntries(written.pages.map((p) => [p.pageNumber, p]));
    expect(byNumber[1].redesignedUrl).toBeTruthy();
    expect(byNumber[3].redesignedUrl).toBeTruthy();
    expect(byNumber[1].imageUrl).toBe("/p1.png");
    expect(byNumber[3].imageUrl).toBe("/p3.png");
  });

  it("leaves the dropped page in job.pages with its original image and no redesign", async () => {
    const { db, updates } = fakeDb({
      id: "job-1",
      sourcePdfUrl: "/source.pdf",
      pages: jobPages,
      data: { trimmedPdfUrl: "/source-trimmed.pdf", keptPageNumbers: [1, 3] },
      bookData: {},
    });
    await stepOneShot(fakeCtx("job-1"), db, twoPageDeps());
    const written = updates.find((u) => Array.isArray((u as { pages?: unknown }).pages)) as { pages: Array<Record<string, unknown>> };
    expect(written.pages).toHaveLength(3);
    const dropped = written.pages.find((p) => p.pageNumber === 2)!;
    expect(dropped.imageUrl).toBe("/p2.png");
    expect(dropped.redesignedUrl).toBeUndefined();
    expect(dropped.excludedFromClone).toBe(true);
  });

  it("preserves the operator's pageType instead of re-deriving it", async () => {
    const { db, updates } = fakeDb({
      id: "job-1",
      sourcePdfUrl: "/source.pdf",
      pages: jobPages,
      data: { trimmedPdfUrl: "/source-trimmed.pdf", keptPageNumbers: [1, 3] },
      bookData: {},
    });
    await stepOneShot(fakeCtx("job-1"), db, twoPageDeps());
    const written = updates.find((u) => Array.isArray((u as { pages?: unknown }).pages)) as { pages: Array<Record<string, unknown>> };
    const byNumber = Object.fromEntries(written.pages.map((p) => [p.pageNumber, p]));
    expect(byNumber[1].pageType).toBe("cover");
    expect(byNumber[3].pageType).toBe("interior");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn workspace @vx/clone-core vitest run src/steps/one-shot.test.ts`
Expected: FAIL — `runOneShot` is called with `/source.pdf`, and `job.pages` is replaced with 2 pages instead of merged into 3.

- [ ] **Step 3: Send the trimmed PDF and read the page map**

In `one-shot.ts`, inside `stepOneShot`, replace the block that computes `pdfPublicUrl` (currently lines 112-116):

```ts
    const jobData = (job.data as Record<string, unknown> | null | undefined) ?? {};
    const trimmedPdfUrl =
      typeof jobData.trimmedPdfUrl === "string" ? jobData.trimmedPdfUrl : job.sourcePdfUrl;
    const pdfPublicUrl = deps.resolveR2Url(trimmedPdfUrl);
    const brandInfo = await resolveBrandInfo(job, db);
    ({ sessionId, pages } = await deps.runOneShot(pdfPublicUrl, ctx.jobId, brandInfo));
```

Immediately after the `const existing = ...` line (currently line 76), add the page map:

```ts
  // The trimmed PDF renumbers its pages 1..N, so Diaflow's i-th result belongs
  // to ORIGINAL page keptPageNumbers[i]. Falls back to identity for jobs that
  // predate stepTrimPdf.
  const jobDataForMap = (job.data as Record<string, unknown> | null | undefined) ?? {};
  const keptPageNumbers = Array.isArray(jobDataForMap.keptPageNumbers)
    ? (jobDataForMap.keptPageNumbers as number[])
    : null;
  const originalPageNumber = (i: number): number => keptPageNumbers?.[i] ?? i + 1;
  const existingByNumber = new Map(existing.map((p) => [p.pageNumber, p]));
```

- [ ] **Step 4: Scope the resume check to kept pages only**

The `allDone` short-circuit must ignore dropped pages, which never get a `redesignedUrl`. Replace the `allDone` computation (currently lines 92-98):

```ts
  const keptExisting = keptPageNumbers
    ? existing.filter((p) => keptPageNumbers.includes(p.pageNumber))
    : existing;
  const expectedCount = cachedPages?.length ?? 0;
  const allDone =
    keptExisting.length > 0 &&
    (expectedCount === 0 || keptExisting.length >= expectedCount) &&
    keptExisting.every((p) => p.redesignedUrl && p.status === "reproduced");
```

- [ ] **Step 5: Number pages from the map and stop re-classifying**

In the `for (let i = 0; i < pages.length; i++)` loop, replace the page-number and original-image lines (currently lines 161-170):

```ts
    const pageNumber = originalPageNumber(i);
    const paddedPage = String(pageNumber).padStart(3, "0");
    const existingPage = existingByNumber.get(pageNumber);
    const renderedOriginal = existingPage?.imageUrl ?? "";
    if (!renderedOriginal) {
      console.warn(
        `[stepOneShot] page ${pageNumber}: no rendered original found in job.pages. ` +
          `stepRender may have failed or Diaflow returned more pages than were sent.`,
      );
    }
```

Delete the cover pre-scan block (`const llmFlaggedCover = ...` and `let coverAlreadyAssigned = ...`, currently lines 154-159), and replace the `classifyPage` call inside the loop (currently lines 234-240) with:

```ts
      // Classification now comes from the operator at the pre-spend gate, so
      // preserve it rather than re-deriving it from Diaflow's unreliable
      // isCover/isIntro signals (absent on ~85% of pages).
      const pageType = existingPage?.pageType;
```

Update the two `jobPages.push({...})` calls in the loop to carry the preserved fields — the success branch:

```ts
      jobPages.push({
        ...existingPage,
        pageNumber,
        imageUrl: renderedOriginal,
        redesignedUrl: redesignedR2Url,
        status: "reproduced",
        rawData,
        pageType,
      });
```

and the failure branch:

```ts
      jobPages.push({
        ...existingPage,
        pageNumber,
        imageUrl: renderedOriginal,
        status: "error",
        error: message,
      });
```

Remove the now-unused `classifyPage` import and its `PageType` type import at the top of the file if nothing else references them.

- [ ] **Step 6: Merge rather than replace `job.pages`**

Replace the final page write (currently lines 318-330):

```ts
  // MERGE, never replace: pages the operator dropped were not sent to Diaflow
  // and have no entry in jobPages, but they must stay in job.pages so the
  // exported "Main book" archive keeps the complete source book.
  const touched = new Map(jobPages.map((p) => [p.pageNumber, p]));
  const merged = existing.map((p) => touched.get(p.pageNumber) ?? p);
  for (const p of jobPages) {
    if (!existing.some((e) => e.pageNumber === p.pageNumber)) merged.push(p);
  }
  merged.sort((a, b) => a.pageNumber - b.pageNumber);

  await db.cloneJob.updateMany({
    where: { id: ctx.jobId },
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pages: merged as any,
      analyzedPages: jobPages.length,
      totalPages: merged.length,
    },
  });
```

- [ ] **Step 7: Delete the obsolete auto-classify tests**

The whole `describe("stepOneShot — D2 auto-classify", …)` block in `one-shot.test.ts` (starts line 247) tests behaviour this task removes. It contains exactly two tests:

- `"writes pageType=cover on the isCover page and interior elsewhere"` (line 248)
- `"maps Diaflow isIntro/isInterior signals to interiorIntro/interior"` (line 304)

Delete the entire `describe` block, along with the now-unused `import { classifyPage } from "./classify-page";` at line 3. The replacement coverage is the `"preserves the operator's pageType instead of re-deriving it"` test added in Step 1. `classifyPage` itself stays in the codebase — Task 8 uses it to seed the gate UI's defaults — and keeps its own `classify-page.test.ts`.

- [ ] **Step 8: Run the full clone-core suite**

Run: `yarn workspace @vx/clone-core vitest run`
Expected: PASS, no remaining references to `classifyPage` from `one-shot.ts` or `one-shot.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add packages/clone-core/src/steps/one-shot.ts packages/clone-core/src/steps/one-shot.test.ts
git commit -m "feat(clone): one-shot consumes trimmed PDF and merges results by original page number"
```

---

### Task 6: Move the gate and route the lanes

**Files:**
- Modify: `apps/worker/src/processor/clone-job-processor.ts:60-115`
- Create: `apps/worker/src/processor/clone-job-processor.test.ts`

**Interfaces:**
- Consumes: `planPageSelection` (Task 3), `stepTrimPdf` + `trimPdfDeps` (Task 4), trimmed-PDF-aware `stepOneShot` (Task 5).
- Produces: `job.data.interiorCount: number`, `job.data.lane: 1 | 2`, and CloneJob status `"awaiting-fill"` — read by Task 7.

- [ ] **Step 1: Write the failing test**

Create `apps/worker/src/processor/clone-job-processor.test.ts`. Extract the routing decision into a pure helper first so it is testable without a live DB — this is what the test targets:

```ts
import { describe, it, expect } from "vitest";
import { decideGateOutcome } from "./clone-job-processor";

describe("decideGateOutcome", () => {
  const interiors = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ pageNumber: i + 1, pageType: "interior" as const }));

  it("pauses for the operator when classification is not confirmed", () => {
    expect(decideGateOutcome(interiors(40), false)).toEqual({
      outcome: "await-classify",
    });
  });

  it("routes a confirmed job with 40 interiors to lane 1", () => {
    expect(decideGateOutcome(interiors(40), true)).toEqual({
      outcome: "proceed",
      lane: 1,
      interiorCount: 40,
    });
  });

  it("parks a confirmed job with 39 interiors in lane 2", () => {
    expect(decideGateOutcome(interiors(39), true)).toEqual({
      outcome: "await-fill",
      lane: 2,
      interiorCount: 39,
    });
  });

  it("counts only kept pages toward the lane decision", () => {
    const pages = [
      ...interiors(40),
      { pageNumber: 41, pageType: "interior" as const, excludedFromClone: true },
    ];
    expect(decideGateOutcome(pages, true)).toEqual({
      outcome: "proceed",
      lane: 1,
      interiorCount: 40,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @vx/worker vitest run src/processor/clone-job-processor.test.ts`
Expected: FAIL — `decideGateOutcome` is not exported.

- [ ] **Step 3: Add the pure helper**

In `clone-job-processor.ts`, add above `processCloneJob`:

```ts
export type GateOutcome =
  | { outcome: "await-classify" }
  | { outcome: "await-fill"; lane: 2; interiorCount: number }
  | { outcome: "proceed"; lane: 1; interiorCount: number };

/**
 * Pure gate decision. Kept separate from processCloneJob so the routing rule is
 * unit-testable without a database.
 */
export function decideGateOutcome(
  pages: SelectablePage[],
  classifyConfirmed: boolean,
): GateOutcome {
  if (!classifyConfirmed) return { outcome: "await-classify" };
  const { interiorCount, lane } = planPageSelection(pages);
  return lane === 1
    ? { outcome: "proceed", lane: 1, interiorCount }
    : { outcome: "await-fill", lane: 2, interiorCount };
}
```

Add to the existing `@vx/clone-core` import block:

```ts
  stepTrimPdf,
  planPageSelection,
  type SelectablePage,
```

and to the `./step-deps` import block:

```ts
  trimPdfDeps,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @vx/worker vitest run src/processor/clone-job-processor.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Move the gate block and add routing**

In `processCloneJob`, delete the gate block currently at lines 88-106 (from the `// D2 gate` comment through the `return;` and its closing brace).

Then, immediately after the render/reproduce branch's `stepRender` call and **before** `stepOneShot`, insert the gate. The one-shot branch (currently lines 82-85) becomes:

```ts
      if (!ctx.isDone("render")) await withRetry("render", () => stepRender(ctx, db, renderDeps), ctx);

      // ---- Gate: everything above is free, everything below costs money. ----
      const gateRow = await db.cloneJob.findUnique({
        where: { id: jobId },
        select: { data: true, pages: true },
      });
      const gateData = (gateRow?.data as { classifyConfirmed?: boolean } | null | undefined) ?? {};
      const gatePages = (gateRow?.pages as SelectablePage[] | null | undefined) ?? [];
      const decision = decideGateOutcome(gatePages, gateData.classifyConfirmed === true);

      if (decision.outcome === "await-classify") {
        await db.cloneJob.updateMany({
          where: { id: jobId },
          data: { status: "awaiting-classify" },
        });
        console.log(`[worker] clone job ${jobId} paused at classify gate (pre-spend)`);
        return;
      }

      await db.cloneJob.updateMany({
        where: { id: jobId },
        data: {
          data: {
            ...gateData,
            interiorCount: decision.interiorCount,
            lane: decision.lane,
          } as never,
        },
      });

      if (decision.outcome === "await-fill") {
        await db.cloneJob.updateMany({
          where: { id: jobId },
          data: { status: "awaiting-fill" },
        });
        console.log(
          `[worker] clone job ${jobId} parked in lane 2 ` +
            `(interior=${decision.interiorCount} < 40) — no AI spend`,
        );
        return;
      }

      if (!ctx.isDone("trim-pdf"))
        await withRetry("trim-pdf", () => stepTrimPdf(ctx, db, trimPdfDeps), ctx);
      if (!ctx.isDone("reproduce"))
        await withRetry("reproduce", () => stepOneShot(ctx, db, oneShotDeps), ctx);
```

Leave the multi-step branch untouched — it is legacy and `useMultiStep` is `false` on every job in the last 400.

Leave the `stepFillInterior` call where it is. In Lane 1 `interiorCount >= 40`, so `planFillInterior` returns `[]` and the step is a no-op; removing it is out of scope.

- [ ] **Step 6: Verify the worker typechecks and the suite passes**

Run: `yarn workspace @vx/worker typecheck && yarn workspace @vx/worker vitest run`
Expected: no type errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/processor/clone-job-processor.ts apps/worker/src/processor/clone-job-processor.test.ts
git commit -m "feat(worker): move classify gate ahead of Diaflow and route lanes"
```

---

### Task 7: Classify route accepts the new flag and reports the routing outcome

**Files:**
- Modify: `apps/admin/src/app/api/clone/[jobId]/classify/route.ts:11,24-32,44-58`
- Modify: `packages/coloring/src/data/status.ts`

**Interfaces:**
- Consumes: `planPageSelection` (Task 3) — `apps/admin` already depends on `@vx/clone-core`; the `awaiting-fill` status (Task 6).
- Produces: `PATCH` response body `{ ok: true, confirmed: boolean, interiorCount: number, lane: 1 | 2 }` — read by Task 8.

- [ ] **Step 1: Accept `excludedFromClone` in the edit payload**

Replace the `Edit` type at line 11:

```ts
type Edit = {
  pageNumber: number;
  pageType?: CloneJobPage["pageType"];
  excludedFromClone?: boolean;
};
```

and the merge block at lines 26-32:

```ts
  const pages = ((row.pages as CloneJobPage[] | null) ?? []).map((p) => {
    const e = editByPage.get(p.pageNumber);
    if (!e) return p;
    return {
      ...p,
      ...(e.pageType !== undefined ? { pageType: e.pageType } : {}),
      ...(e.excludedFromClone !== undefined
        ? { excludedFromClone: e.excludedFromClone }
        : {}),
    };
  });
```

- [ ] **Step 2: Compute and return the routing outcome**

Add the import:

```ts
import { planPageSelection } from "@vx/clone-core/steps";
```

Replace the write + response (lines 34-58) with:

```ts
  const { interiorCount, lane } = planPageSelection(pages);
  const prevData = (row.data as Record<string, unknown> | null) ?? {};

  await prisma.cloneJob.update({
    where: { id: jobId },
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pages: pages as any,
      ...(confirm
        ? {
            status: "queued",
            data: { ...prevData, classifyConfirmed: true, interiorCount, lane } as never,
          }
        : { data: { ...prevData, interiorCount, lane } as never }),
    },
  });

  if (confirm) {
    // Bound the enqueue so a down/unreachable Redis returns a clear 503 instead
    // of hanging the request forever (maxRetriesPerRequest:null queues commands
    // indefinitely). The row is already status=queued, so the reconciler will
    // re-enqueue it once the queue is back — mirrors the /start route.
    try {
      await withQueueTimeout(enqueueCloneJob(cloneQueue, jobId));
    } catch (err) {
      if (isQueueTimeout(err)) return queueUnavailableResponse({ jobId, confirmed: confirm });
      throw err;
    }
  }

  return NextResponse.json({ ok: true, confirmed: confirm, interiorCount, lane });
```

- [ ] **Step 3: Register the new status and give Lane 2 its own tab**

Without both edits, parked Lane 2 jobs render as a raw status string and are unreachable from the jobs list.

In `packages/coloring/src/data/status.ts`, add to `STATUS_META` after the `"awaiting-classify"` entry:

```ts
  "awaiting-fill": { bucket: "queue", label: "Chờ bổ sung trang", tone: "carbon" },
```

Bucket is `queue`, not `error` — nothing failed, the job is waiting on a capability that does not exist yet. Tone matches `stashed`, the closest existing concept.

Then add a tab to `STATUS_TABS`, after the `"gate"` entry:

```ts
  { key: "awaiting-fill", label: "Chờ bổ sung trang", filter: "awaiting-fill", countKeys: ["awaiting-fill"], barColor: "var(--carbon-700)" },
```

- [ ] **Step 4: Verify**

Run: `yarn workspace @vx/admin typecheck && yarn workspace @vx/coloring vitest run`
Expected: no type errors; the existing `use-classify-gate.test.ts` still passes.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/src/app/api/clone/[jobId]/classify/route.ts" packages/coloring/src/data/status.ts
git commit -m "feat(admin): classify route returns interior count and lane"
```

---

### Task 8: Gate UI shows the interior count and its consequence

The grid already renders `p.redesignedUrl || p.imageUrl`, so it falls back to the rendered original automatically once the gate runs before reproduce. What is missing is the count that tells the operator what confirming will do.

**Files:**
- Modify: `packages/coloring/src/data/use-classify-gate.ts:10,14-16`
- Modify: `packages/coloring/src/screens/jobs/job-classify-tab.tsx:19,100-131`
- Test: `packages/coloring/src/data/use-classify-gate.test.ts`

**Interfaces:**
- Consumes: the response body from Task 7.
- Produces: `countInteriorPages(edits: ClassifyEdit[]): number` and `GATE_MIN_INTERIOR: 40`, both local to `@vx/coloring`.

> **`@vx/coloring` cannot import `@vx/clone-core`.** Its `package.json` dependencies are only `@dnd-kit/*`, `@tabler/icons-react`, `@vx/core-uikit`, and `fabric`. Do **not** import `LANE1_MIN_INTERIOR` or `planPageSelection` from `@vx/clone-core/steps` — mirror them locally as below. The worker's `planPageSelection` stays the single source of truth for the actual routing — this mirror only drives what the operator sees before confirming. Step 1's test covers the mirror's rule; if the threshold or the interior rule ever changes, both copies must move together.

- [ ] **Step 1: Write the failing test**

Append to `packages/coloring/src/data/use-classify-gate.test.ts`:

```ts
import { countInteriorPages } from "./use-classify-gate";

describe("countInteriorPages", () => {
  it("counts kept pages that are not cover or intro", () => {
    expect(
      countInteriorPages([
        { pageNumber: 1, pageType: "cover", excludedFromClone: false },
        { pageNumber: 2, pageType: "interiorIntro", excludedFromClone: false },
        { pageNumber: 3, pageType: "interior", excludedFromClone: false },
        { pageNumber: 4, pageType: "interior", excludedFromClone: false },
      ]),
    ).toBe(2);
  });

  it("does not count dropped pages", () => {
    expect(
      countInteriorPages([
        { pageNumber: 1, pageType: "interior", excludedFromClone: false },
        { pageNumber: 2, pageType: "interior", excludedFromClone: true },
      ]),
    ).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @vx/coloring vitest run src/data/use-classify-gate.test.ts`
Expected: FAIL — `countInteriorPages` is not exported.

- [ ] **Step 3: Rename the edit field and add the counter**

In `use-classify-gate.ts`, replace the `ClassifyEdit` type at line 10 and add the helper:

```ts
export type ClassifyEdit = {
  pageNumber: number;
  pageType?: PageType;
  excludedFromClone?: boolean;
};

/**
 * Display-only mirror of `LANE1_MIN_INTERIOR` in @vx/clone-core. Duplicated
 * because @vx/coloring does not depend on @vx/clone-core; the worker's copy
 * remains authoritative for the actual routing decision.
 */
export const GATE_MIN_INTERIOR = 40;

/** Interior pages that will actually be sent for cloning. Mirrors planPageSelection. */
export function countInteriorPages(edits: ClassifyEdit[]): number {
  return edits.filter(
    (e) =>
      !e.excludedFromClone &&
      e.pageType !== "cover" &&
      e.pageType !== "interiorIntro",
  ).length;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @vx/coloring vitest run src/data/use-classify-gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the field rename and the banner into the tab**

In `job-classify-tab.tsx`:

Rename the field on the `Row` type at line 19:

```ts
type Row = { pageNumber: number; url: string; pageType: PageType; excludedFromClone: boolean };
```

and rename every read of `row.excluded` to `row.excludedFromClone` — lines 40, 54, 64, 83, 84 — plus the edits projection at line 114:

```ts
    () => rows.map((r) => ({ pageNumber: r.pageNumber, pageType: r.pageType, excludedFromClone: r.excludedFromClone })),
```

The `rows` mapping at lines 99-103 is rewritten wholesale in the next instruction, so do not patch line 102 separately.

Seed the default classification so the operator edits a sensible starting point instead of a grid where every page reads "interior". Replace the `rows` mapping at lines 99-103 with:

```ts
  // Seed page 1 as the cover, everything else interior — the same fallback
  // classifyPage() applies in @vx/clone-core, inlined because @vx/coloring
  // cannot depend on that package. The operator corrects it from here.
  let coverSeen = false;
  const rows: Row[] = pages.map((p) => {
    const seeded: PageType =
      (p.pageType as PageType) ??
      (p.pageNumber === 1 && !coverSeen ? "cover" : "interior");
    if (seeded === "cover") coverSeen = true;
    return {
      pageNumber: p.pageNumber,
      url: p.redesignedUrl || p.imageUrl,
      pageType: seeded,
      excludedFromClone: p.excludedFromClone ?? p.excluded ?? false,
    };
  });
```

Then add the counter next to the existing `coverCount` at line 117:

```tsx
  const interiorCount = countInteriorPages(edits);
  const lane2 = interiorCount < GATE_MIN_INTERIOR;
```

and render a banner above the grid, before the confirm button:

```tsx
      <div
        style={{
          padding: "0.75rem 1rem",
          borderRadius: 8,
          background: lane2
            ? "color-mix(in srgb, orange 18%, var(--card))"
            : "color-mix(in srgb, green 15%, var(--card))",
        }}
      >
        <strong>Interior: {interiorCount}</strong>
        {lane2 ? (
          <span>
            {" "}— dưới {GATE_MIN_INTERIOR}. Xác nhận sẽ đưa job vào hàng chờ bổ
            sung trang, KHÔNG gọi Diaflow và không tốn chi phí.
          </span>
        ) : (
          <span>
            {" "}— đủ điều kiện. Xác nhận sẽ gửi {edits.filter((e) => !e.excludedFromClone).length}{" "}
            trang cho Diaflow và bắt đầu phát sinh chi phí.
          </span>
        )}
      </div>
```

Add the import — one line, both symbols from the local module:

```ts
import { countInteriorPages, GATE_MIN_INTERIOR } from "../../data/use-classify-gate";
```

- [ ] **Step 6: Verify**

Run: `yarn workspace @vx/coloring vitest run && yarn workspace @vx/admin typecheck`
Expected: all pass.

- [ ] **Step 7: Drive the app**

Start the admin with the SSH tunnel already up:

```bash
yarn workspace @vx/admin dev
```

Open a job in `awaiting-classify`, confirm the grid renders original page images, toggle a page's drop mark, and confirm the banner's interior count and the lane message both update. Do **not** press Confirm on a production job unless you intend it to run.

- [ ] **Step 8: Commit**

```bash
git add packages/coloring/src/data/use-classify-gate.ts packages/coloring/src/data/use-classify-gate.test.ts packages/coloring/src/screens/jobs/job-classify-tab.tsx
git commit -m "feat(admin): show interior count and lane consequence at the classify gate"
```

---

## Post-implementation: measure before extrapolating

The spec's saving estimate is a ceiling, not a forecast — no page has ever been dropped, so the real drop rate is unknown. After the first ~20 gated jobs, run a read-only audit over `CloneJob.pages` counting `excludedFromClone: true` per job and compare against the 44-page median. If operators drop only 1–2 pages per book the saving is ~3%, and the remaining case for this work rests on Lane 2 routing, correct `pageType` for the export archive, and the still-open W3/W6 items. Record the result back in the spec.
