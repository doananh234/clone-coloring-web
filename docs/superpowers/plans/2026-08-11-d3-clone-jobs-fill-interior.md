# D3 — Clone Jobs Fill-Interior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the D2 classify gate, auto-fill each clone job's interior pages up to a configurable target (default 40) by cloning random interiors of the same source book, marked Original/Additional, with operator Regen/Delete/Fill controls in the compare tab.

**Architecture:** A new pure planner `planFillInterior` decides which source interiors to clone and at what change-% (escalating on reuse). A new worker step `stepFillInterior` runs it between `reproduce` and `create-book` (right after the gate passes on resume), generating + persisting `origin:"additional"` pages. Three admin API routes expose manual Fill / in-place Regen / Delete. The existing `JobCompareTab` gains a progress header, orange additional thumbnails, and a parent↔additional panel.

**Tech Stack:** TypeScript, Next.js 16 (admin API routes), Prisma (`@vx/db`), BullMQ worker (`@vx/clone-core` steps), React (coloring package), Vitest.

## Global Constraints

- **Target:** effective target = `job.data.targetInteriorCount ?? DEFAULT_TARGET_INTERIOR (40)`.
- **Change-% escalation (auto-fill):** `min(FILL_CHANGE_CAP, FILL_CHANGE_BASE + round * FILL_CHANGE_STEP)` → base **40**, step **+10**, cap **80** (40/50/60/70/80…). `round` = number of full passes already made over the source pool.
- **Regen-in-place:** change-% comes from the operator's existing `% thay đổi` input on the tab (clamp 5–95, default 30).
- **Marking storage:** DB persists ONLY `origin: "original" | "additional"` and `parentPageNumber?: number`. `displayNumber` + `backgroundColor` are derived in the UI, never stored.
- **Interior definition (shared with create-book):** a page is interior when `pageType !== "cover" && pageType !== "interiorIntro"` (legacy `undefined` counts as interior).
- **Additional source pool:** original (`origin !== "additional"`), interior, `!excluded`, with an `imageUrl`.
- **Delete guard:** only `origin === "additional"` pages may be deleted via the API; never originals.
- **No changes to** `generatePage`/`buildRedesignPrompt` (the `prompt` arg stays ignored; variation is driven by `changePercent`).
- **clone-core & coloring have no `typecheck` script** — the integration typecheck gate for changes in those packages is `cd apps/admin && yarn typecheck` (admin imports both). server-core has its own `yarn typecheck --filter=@vx/server-core`.

---

## File Structure

**Create:**
- `packages/clone-core/src/steps/fill-interior.ts` — constants, `planFillInterior` (pure), `stepFillInterior` (worker step), deps type.
- `packages/clone-core/src/steps/fill-interior.test.ts` — planner unit tests.
- `apps/admin/src/app/api/clone/[jobId]/fill-interior/route.ts` — manual "Fill lại" (POST).
- `apps/admin/src/app/api/clone/[jobId]/pages/[pageNumber]/regen/route.ts` — in-place regen of an additional page (POST).
- `packages/coloring/src/data/use-fill-interior.ts` — client hook + `deriveAdditionalMeta` pure helper.
- `packages/coloring/src/data/use-fill-interior.test.ts` — `deriveAdditionalMeta` unit tests.

**Modify:**
- `packages/clone-core/src/types.ts` — add `"fill-interior"` to `CloneStep` + `STEP_ORDER`.
- `packages/clone-core/src/job-context.ts` — add `targetInteriorCount?` to `CloneJobDataExtras`.
- `packages/clone-core/src/steps/index.ts` — export the new step + planner.
- `packages/server-core/src/ai/clone-types.ts` — add `origin` + `parentPageNumber` to `CloneJobPage`.
- `packages/coloring/src/data/types.ts` — same two fields on the coloring `CloneJobPage`.
- `apps/worker/src/processor/step-deps.ts` — add `fillInteriorDeps`.
- `apps/worker/src/processor/clone-job-processor.ts` — import + call `stepFillInterior` after the gate.
- `packages/clone-core/src/steps/create-book.ts` — sort interior pages by `pageNumber`.
- `apps/admin/src/app/api/clone/[jobId]/create-book/route.ts` — same sort (parity).
- `apps/admin/src/app/api/clone/[jobId]/pages/[pageNumber]/route.ts` — add `DELETE` (additional-only).
- `packages/coloring/src/screens/jobs/job-compare-tab.tsx` — progress header, orange strip, additional panel.

---

## Task 1: Data model & pipeline step registration

**Files:**
- Modify: `packages/clone-core/src/types.ts:1-18`
- Modify: `packages/clone-core/src/job-context.ts:6-14`
- Modify: `packages/server-core/src/ai/clone-types.ts:45-72`
- Modify: `packages/coloring/src/data/types.ts:25-50`
- Test: `packages/clone-core/src/step-order.test.ts` (new)

**Interfaces:**
- Produces: `CloneStep` now includes `"fill-interior"`; `STEP_ORDER` has it between `"reproduce"` and `"create-book"`. `CloneJobPage` (server-core + coloring) gains `origin?: "original" | "additional"` and `parentPageNumber?: number`. `CloneJobDataExtras` gains `targetInteriorCount?: number`.

- [ ] **Step 1: Write the failing test**

Create `packages/clone-core/src/step-order.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { STEP_ORDER } from "./types";

describe("STEP_ORDER", () => {
  it("places fill-interior between reproduce and create-book", () => {
    const i = STEP_ORDER.indexOf("fill-interior");
    expect(i).toBeGreaterThan(-1);
    expect(STEP_ORDER[i - 1]).toBe("reproduce");
    expect(STEP_ORDER[i + 1]).toBe("create-book");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/clone-core && yarn vitest run src/step-order.test.ts`
Expected: FAIL — `indexOf("fill-interior")` is `-1` (also a TS error on the string literal).

- [ ] **Step 3: Add the step to `types.ts`**

In `packages/clone-core/src/types.ts` replace the `CloneStep` union and `STEP_ORDER`:
```ts
export type CloneStep =
  | "download"
  | "render"
  | "analyze"
  | "extract-entities"
  | "reproduce"
  | "fill-interior"
  | "create-book"
  | "generate-cover";

export const STEP_ORDER: readonly CloneStep[] = [
  "download",
  "render",
  "analyze",
  "extract-entities",
  "reproduce",
  "fill-interior",
  "create-book",
  "generate-cover",
] as const;
```

- [ ] **Step 4: Add `targetInteriorCount` to `CloneJobDataExtras`**

In `packages/clone-core/src/job-context.ts`, add the field inside the interface (after `finishedAt?`):
```ts
  finishedAt?: string;
  /** D3 per-job override for interior target; falls back to DEFAULT_TARGET_INTERIOR. */
  targetInteriorCount?: number;
  [k: string]: unknown;
```

- [ ] **Step 5: Add `origin` + `parentPageNumber` to both `CloneJobPage` types**

In `packages/server-core/src/ai/clone-types.ts`, add after the `excluded?` field (line 71):
```ts
  /** D2 inclusion flag — true drops the page from the built Book. */
  excluded?: boolean;
  /** D3 lineage — "additional" = auto-filled clone; undefined/"original" = source page. */
  origin?: "original" | "additional";
  /** D3 lineage — for additional pages, the pageNumber of the interior it was cloned from. */
  parentPageNumber?: number;
```

In `packages/coloring/src/data/types.ts`, add after `excluded?` (line 31):
```ts
  pageType?: "cover" | "interiorIntro" | "interior";
  excluded?: boolean;
  /** D3 lineage fields (set by stepFillInterior / fill route). */
  origin?: "original" | "additional";
  parentPageNumber?: number;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/clone-core && yarn vitest run src/step-order.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `cd apps/admin && yarn typecheck` and `yarn typecheck --filter=@vx/server-core`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/clone-core/src/types.ts packages/clone-core/src/job-context.ts \
  packages/server-core/src/ai/clone-types.ts packages/coloring/src/data/types.ts \
  packages/clone-core/src/step-order.test.ts
git commit -m "feat(clone): register fill-interior step + origin/parentPageNumber fields (D3 T-008)"
```

---

## Task 2: `planFillInterior` pure planner

**Files:**
- Create: `packages/clone-core/src/steps/fill-interior.ts`
- Test: `packages/clone-core/src/steps/fill-interior.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - Constants `DEFAULT_TARGET_INTERIOR = 40`, `FILL_CHANGE_BASE = 40`, `FILL_CHANGE_STEP = 10`, `FILL_CHANGE_CAP = 80`.
  - `interface FillInteriorPage { pageNumber: number; imageUrl?: string; pageType?: "cover"|"interiorIntro"|"interior"; excluded?: boolean; origin?: "original"|"additional" }`
  - `interface FillTask { sourceImageUrl: string; parentPageNumber: number; pageNumber: number; changePercent: number }`
  - `function planFillInterior(pages: FillInteriorPage[], target: number, opts?: { shuffle?: <T>(a: T[]) => T[] }): FillTask[]`

- [ ] **Step 1: Write the failing test**

Create `packages/clone-core/src/steps/fill-interior.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { planFillInterior, type FillInteriorPage } from "./fill-interior";

// Build N interior pages numbered 1..N with a source image each.
const interiors = (n: number): FillInteriorPage[] =>
  Array.from({ length: n }, (_, i) => ({
    pageNumber: i + 1,
    imageUrl: `/src/page-${i + 1}.png`,
    pageType: "interior" as const,
    origin: "original" as const,
  }));

describe("planFillInterior", () => {
  it("30 interiors, target 40 → 10 distinct-parent tasks all at 40%", () => {
    const tasks = planFillInterior(interiors(30), 40);
    expect(tasks).toHaveLength(10);
    expect(tasks.every((t) => t.changePercent === 40)).toBe(true);
    expect(tasks.map((t) => t.pageNumber)).toEqual(
      [31, 32, 33, 34, 35, 36, 37, 38, 39, 40],
    );
    // identity shuffle → parents are the first 10 interiors, none repeated
    expect(new Set(tasks.map((t) => t.parentPageNumber)).size).toBe(10);
  });

  it("10 interiors, target 40 → 30 tasks escalating 40/50/60 per reuse round", () => {
    const tasks = planFillInterior(interiors(10), 40);
    expect(tasks).toHaveLength(30);
    expect(tasks.slice(0, 10).every((t) => t.changePercent === 40)).toBe(true);
    expect(tasks.slice(10, 20).every((t) => t.changePercent === 50)).toBe(true);
    expect(tasks.slice(20, 30).every((t) => t.changePercent === 60)).toBe(true);
  });

  it("caps change-% at 80 on deep reuse", () => {
    // 1 interior, target 7 → rounds 0..6 → 40,50,60,70,80,80,80
    const tasks = planFillInterior(interiors(1), 7);
    expect(tasks.map((t) => t.changePercent)).toEqual([40, 50, 60, 70, 80, 80, 80]);
  });

  it("returns [] when already at/over target", () => {
    expect(planFillInterior(interiors(40), 40)).toEqual([]);
    expect(planFillInterior(interiors(45), 40)).toEqual([]);
  });

  it("returns [] when the source pool is empty (no original interiors)", () => {
    const pages: FillInteriorPage[] = [
      { pageNumber: 1, imageUrl: "/c.png", pageType: "cover" },
      { pageNumber: 2, imageUrl: "/i.png", pageType: "interiorIntro" },
    ];
    expect(planFillInterior(pages, 40)).toEqual([]);
  });

  it("excludes excluded pages from both count and pool", () => {
    const pages = interiors(12).map((p, i) => (i < 2 ? { ...p, excluded: true } : p));
    // existing interior !excluded = 10 → need 30
    expect(planFillInterior(pages, 40)).toHaveLength(30);
  });

  it("never picks an additional page as a source", () => {
    const pages: FillInteriorPage[] = [
      ...interiors(3),
      { pageNumber: 4, imageUrl: "/a.png", pageType: "interior", origin: "additional" },
    ];
    // existing interior !excluded = 4 → need... target 6 → 2 tasks, parents ∈ {1,2,3}
    const tasks = planFillInterior(pages, 6);
    expect(tasks).toHaveLength(2);
    expect(tasks.every((t) => [1, 2, 3].includes(t.parentPageNumber))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/clone-core && yarn vitest run src/steps/fill-interior.test.ts`
Expected: FAIL — module `./fill-interior` not found.

- [ ] **Step 3: Write the planner**

Create `packages/clone-core/src/steps/fill-interior.ts`:
```ts
export const DEFAULT_TARGET_INTERIOR = 40;
export const FILL_CHANGE_BASE = 40;
export const FILL_CHANGE_STEP = 10;
export const FILL_CHANGE_CAP = 80;

export interface FillInteriorPage {
  pageNumber: number;
  imageUrl?: string;
  pageType?: "cover" | "interiorIntro" | "interior";
  excluded?: boolean;
  origin?: "original" | "additional";
}

export interface FillTask {
  sourceImageUrl: string;
  parentPageNumber: number;
  pageNumber: number;
  changePercent: number;
}

/** Shared with create-book: legacy (undefined pageType) counts as interior. */
const isInterior = (p: FillInteriorPage): boolean =>
  p.pageType !== "cover" && p.pageType !== "interiorIntro";

/**
 * Decide which source interiors to clone (and at what change-%) to reach `target`
 * total interior pages. Pure + deterministic given `opts.shuffle` (defaults to
 * identity so tests are stable; the worker injects a real shuffle at runtime).
 *
 * - need = max(0, target - existing interior !excluded)
 * - pool = ORIGINAL interior !excluded pages with an imageUrl
 * - pick round-robin: distinct sources until the pool is exhausted, then a new
 *   shuffled pass. Each full pass ("round") bumps change-% by FILL_CHANGE_STEP
 *   (capped) so repeated clones of the same source diverge.
 */
export function planFillInterior(
  pages: FillInteriorPage[],
  target: number,
  opts: { shuffle?: <T>(a: T[]) => T[] } = {},
): FillTask[] {
  const shuffle = opts.shuffle ?? (<T,>(a: T[]) => a);
  const existing = pages.filter((p) => isInterior(p) && !p.excluded).length;
  const need = Math.max(0, target - existing);
  const pool = pages.filter(
    (p) => p.origin !== "additional" && isInterior(p) && !p.excluded && !!p.imageUrl,
  );
  if (need === 0 || pool.length === 0) return [];

  let nextSeq = Math.max(...pages.map((p) => p.pageNumber)) + 1;
  const tasks: FillTask[] = [];
  let made = 0;
  while (made < need) {
    const round = Math.floor(made / pool.length);
    const changePercent = Math.min(
      FILL_CHANGE_CAP,
      FILL_CHANGE_BASE + round * FILL_CHANGE_STEP,
    );
    const ordered = shuffle(pool.slice());
    for (let k = 0; k < ordered.length && made < need; k++) {
      const src = ordered[k];
      tasks.push({
        sourceImageUrl: src.imageUrl as string,
        parentPageNumber: src.pageNumber,
        pageNumber: nextSeq++,
        changePercent,
      });
      made++;
    }
  }
  return tasks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/clone-core && yarn vitest run src/steps/fill-interior.test.ts`
Expected: PASS (all 7 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/clone-core/src/steps/fill-interior.ts packages/clone-core/src/steps/fill-interior.test.ts
git commit -m "feat(clone): planFillInterior — round-robin source pick + escalating change-% (D3 T-006/007)"
```

---

## Task 3: `stepFillInterior` worker step + wiring

**Files:**
- Modify: `packages/clone-core/src/steps/fill-interior.ts` (append the step + deps)
- Modify: `packages/clone-core/src/steps/index.ts`
- Modify: `apps/worker/src/processor/step-deps.ts:126`
- Modify: `apps/worker/src/processor/clone-job-processor.ts:1-24,104-108`

**Interfaces:**
- Consumes: `planFillInterior`, `DEFAULT_TARGET_INTERIOR` (Task 2); `JobContext.markStepComplete` (existing).
- Produces:
  - `interface FillInteriorDeps { generatePage: (a: { prompt: string; sourceImageUrl: string; pageNumber: number; jobId: string; changePercent?: number }) => Promise<{ base64: string }>; uploadToR2: (a: { key: string; body: Buffer; contentType: string }) => Promise<{ url: string }>; shuffle?: <T>(a: T[]) => T[] }`
  - `async function stepFillInterior(ctx: JobContext, db: PrismaClient, deps: FillInteriorDeps): Promise<void>`
  - `fillInteriorDeps` export in `step-deps.ts`.

- [ ] **Step 1: Append the step + deps type to `fill-interior.ts`**

Add these imports at the TOP of `packages/clone-core/src/steps/fill-interior.ts`:
```ts
import type { PrismaClient } from "@vx/db";
import type { JobContext } from "../job-context";
```

Append at the END of `packages/clone-core/src/steps/fill-interior.ts`:
```ts
export interface FillInteriorDeps {
  generatePage: (a: {
    prompt: string;
    sourceImageUrl: string;
    pageNumber: number;
    jobId: string;
    changePercent?: number;
  }) => Promise<{ base64: string }>;
  uploadToR2: (a: { key: string; body: Buffer; contentType: string }) => Promise<{ url: string }>;
  shuffle?: <T>(a: T[]) => T[];
}

/**
 * stepFillInterior — clone random source interiors up to the job's target so
 * the built book has enough interior pages. Runs AFTER the D2 classify gate
 * (operator has confirmed which pages are interior/excluded) and BEFORE
 * create-book. Idempotent via ctx.isDone("fill-interior"): on gate-resume it
 * fills exactly once. Appends origin:"additional" pages; never mutates originals.
 */
export async function stepFillInterior(
  ctx: JobContext,
  db: PrismaClient,
  deps: FillInteriorDeps,
): Promise<void> {
  const job = await db.cloneJob.findUnique({ where: { id: ctx.jobId } });
  if (!job) throw new Error(`cloneJob ${ctx.jobId} missing`);

  const existingPages = (job.pages as FillInteriorPage[] | null | undefined) ?? [];
  const data = (job.data as { targetInteriorCount?: number } | null | undefined) ?? {};
  const target = data.targetInteriorCount ?? DEFAULT_TARGET_INTERIOR;

  const tasks = planFillInterior(existingPages, target, { shuffle: deps.shuffle });
  if (tasks.length === 0) {
    await ctx.markStepComplete("fill-interior");
    return;
  }

  const created: Record<string, unknown>[] = [];
  for (const t of tasks) {
    const { base64 } = await deps.generatePage({
      prompt: "",
      sourceImageUrl: t.sourceImageUrl,
      pageNumber: t.pageNumber,
      jobId: ctx.jobId,
      changePercent: t.changePercent,
    });
    const body = Buffer.from(base64, "base64");
    const key = `assets/clone-jobs/${ctx.jobId}/redesigned/page-${String(t.pageNumber).padStart(3, "0")}.png`;
    const { url } = await deps.uploadToR2({ key, body, contentType: "image/png" });
    created.push({
      pageNumber: t.pageNumber,
      imageUrl: t.sourceImageUrl,
      redesignedUrl: url,
      status: "reproduced",
      pageType: "interior",
      origin: "additional",
      parentPageNumber: t.parentPageNumber,
    });
  }

  // Re-read to merge against the freshest pages (operator edits at the gate
  // landed on job.pages; we only append, never overwrite).
  const fresh = await db.cloneJob.findUnique({ where: { id: ctx.jobId }, select: { pages: true } });
  const base = (fresh?.pages as Record<string, unknown>[] | null | undefined) ?? [];
  await db.cloneJob.updateMany({
    where: { id: ctx.jobId },
    data: { pages: [...base, ...created] as never },
  });

  await ctx.markStepComplete("fill-interior");
}
```

- [ ] **Step 2: Export from the steps barrel**

In `packages/clone-core/src/steps/index.ts`, add:
```ts
export {
  stepFillInterior,
  planFillInterior,
  DEFAULT_TARGET_INTERIOR,
  type FillInteriorDeps,
  type FillInteriorPage,
  type FillTask,
} from "./fill-interior";
```
(If `index.ts` re-exports via `export * from "./one-shot"` style, add `export * from "./fill-interior";` instead — match the file's existing convention.)

- [ ] **Step 3: Add `fillInteriorDeps` to `step-deps.ts`**

In `apps/worker/src/processor/step-deps.ts`, add after the `reproduceDeps` line (line 126):
```ts
export const reproduceDeps = { generatePage, uploadToR2, resolveR2Url };
export const fillInteriorDeps = {
  generatePage,
  uploadToR2,
  // Fisher–Yates in place; runtime-only (worker), so Math.random is fine here.
  shuffle: <T>(a: T[]): T[] => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
};
```

- [ ] **Step 4: Wire the step into the processor**

In `apps/worker/src/processor/clone-job-processor.ts`, add to the `@vx/clone-core` import (after `stepGenerateCover,`):
```ts
  stepGenerateCover,
  stepFillInterior,
```
and to the `./step-deps` import (after `generateCoverDeps,`):
```ts
  generateCoverDeps,
  fillInteriorDeps,
```
Then insert the fill call BETWEEN the gate block and create-book (after the `if (!gateData.classifyConfirmed) { … return; }` block ends at line 104, before `const bookId = …` at line 106):
```ts
    // D3 — reach the configured interior target by cloning source interiors.
    // Runs only after the gate passed (operator confirmed classification).
    if (!ctx.isDone("fill-interior"))
      await withRetry("fill-interior", () => stepFillInterior(ctx, db, fillInteriorDeps), ctx);

    const bookId = ctx.isDone("create-book") && ctx.resultBookId
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/admin && yarn typecheck`
Expected: no errors. (Admin imports `@vx/clone-core`, so this validates the new step + barrel export types. The worker has no typecheck script; its imports resolve through the same package types.)

- [ ] **Step 6: Reasoning check (no worker test harness)**

Confirm by re-reading, and write this into the commit body:
- On first run, one-shot marks `reproduce`; the gate sees `classifyConfirmed` unset → status `awaiting-classify`, returns. `stepFillInterior` NOT reached.
- On resume after confirm: `isDone("reproduce")` true → one-shot skipped; gate passes; `isDone("fill-interior")` false → `stepFillInterior` runs once, appends additional pages, marks `fill-interior`; create-book runs next.
- If the job re-enqueues again, `isDone("fill-interior")` true → fill is skipped (idempotent). Manual "Fill lại" (Task 5) does NOT depend on this flag.

- [ ] **Step 7: Commit**

```bash
git add packages/clone-core/src/steps/fill-interior.ts packages/clone-core/src/steps/index.ts \
  apps/worker/src/processor/step-deps.ts apps/worker/src/processor/clone-job-processor.ts
git commit -m "feat(worker): stepFillInterior between classify gate and create-book (D3 T-006/007)"
```

---

## Task 4: Stable interior ordering in create-book

**Files:**
- Modify: `packages/clone-core/src/steps/create-book.ts:109-111`
- Modify: `apps/admin/src/app/api/clone/[jobId]/create-book/route.ts:50-52`

**Interfaces:**
- Consumes: `origin`/`parentPageNumber` fields exist (Task 1) but are not needed here; only `pageNumber` ordering matters.
- Produces: interior pages emitted in ascending `pageNumber` order (originals before appended additionals).

- [ ] **Step 1: Sort interiors in the worker step**

In `packages/clone-core/src/steps/create-book.ts`, replace the `interiorPages` assignment (lines 109-111):
```ts
  const interiorPages = usablePages
    .filter((p) => p.pageType !== "cover" && p.pageType !== "interiorIntro")
    .sort((a, b) => a.pageNumber - b.pageNumber);
```

- [ ] **Step 2: Sort interiors in the admin route (parity)**

In `apps/admin/src/app/api/clone/[jobId]/create-book/route.ts`, replace the `interiorPages` assignment (lines 50-52):
```ts
    const interiorPages = kept
      .filter((p) => p.pageType !== "cover" && p.pageType !== "interiorIntro")
      .sort((a, b) => a.pageNumber - b.pageNumber);
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/admin && yarn typecheck`
Expected: no errors.

- [ ] **Step 4: Reasoning check**

Additional pages carry `pageNumber > max(original)`, so ascending sort keeps originals first and appended additionals last — a deterministic book order regardless of array insertion order. `excluded` still filtered upstream; cover/intro partitions unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/clone-core/src/steps/create-book.ts \
  apps/admin/src/app/api/clone/[jobId]/create-book/route.ts
git commit -m "feat(clone): order interior pages by pageNumber in create-book (D3)"
```

---

## Task 5: API routes — Fill / Regen-in-place / Delete

**Files:**
- Create: `apps/admin/src/app/api/clone/[jobId]/fill-interior/route.ts`
- Create: `apps/admin/src/app/api/clone/[jobId]/pages/[pageNumber]/regen/route.ts`
- Modify: `apps/admin/src/app/api/clone/[jobId]/pages/[pageNumber]/route.ts` (add `DELETE`)

**Interfaces:**
- Consumes: `planFillInterior`, `DEFAULT_TARGET_INTERIOR` from `@vx/clone-core`; `editImage` from `@vx/server-core/ai`; `buildRedesignPrompt` from `@vx/server-core/ai/prompts`; R2 helpers from `@vx/server-core/r2`.
- Produces: `POST /api/clone/[jobId]/fill-interior`, `POST /api/clone/[jobId]/pages/[pageNumber]/regen`, `DELETE /api/clone/[jobId]/pages/[pageNumber]`.

- [ ] **Step 1: Fill route**

Create `apps/admin/src/app/api/clone/[jobId]/fill-interior/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { editImage } from "@vx/server-core/ai";
import { buildRedesignPrompt } from "@vx/server-core/ai/prompts";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import { flushLangfuse } from "@vx/server-core/langfuse";
import { planFillInterior, DEFAULT_TARGET_INTERIOR } from "@vx/clone-core";
import type { CloneJobPage } from "@vx/server-core/ai/clone-types";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ jobId: string }> };

/** Fisher–Yates (server-side, non-deterministic — fine for source variety). */
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Manual "Fill lại": top up interior pages to the job's target. Idempotent by
 *  count — recomputes need = target - existing on every call. */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });
    if (!row) return NextResponse.json({ error: "Clone job not found" }, { status: 404 });

    const pages = (row.pages as CloneJobPage[]) || [];
    const data = (row.data as { targetInteriorCount?: number } | null) ?? {};
    const target = data.targetInteriorCount ?? DEFAULT_TARGET_INTERIOR;

    const tasks = planFillInterior(pages, target, { shuffle });
    if (tasks.length === 0) {
      return NextResponse.json({ success: true, added: 0 });
    }

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const created: CloneJobPage[] = [];
    for (const t of tasks) {
      const img = await editImage(resolveR2Url(t.sourceImageUrl), buildRedesignPrompt(t.changePercent), {
        trace: { caller: "clone/fill-interior", entityType: "cloneJob", entityId: jobId },
      });
      const base64 = img.base64 || img.dataUrl?.split(",")[1] || "";
      const buffer = Buffer.from(base64, "base64");
      const key = `assets/clone-jobs/${jobId}/redesigned/page-${String(t.pageNumber).padStart(3, "0")}.png`;
      const { url } = await uploadToR2({ client: r2Client, config: r2Config, key, body: buffer, contentType: "image/png" });
      created.push({
        pageNumber: t.pageNumber,
        imageUrl: t.sourceImageUrl,
        redesignedUrl: url,
        status: "analyzed",
        pageType: "interior",
        origin: "additional",
        parentPageNumber: t.parentPageNumber,
      });
    }

    const fresh = await prisma.cloneJob.findUnique({ where: { id: jobId }, select: { pages: true } });
    const base = (fresh?.pages as CloneJobPage[] | null) ?? [];
    await prisma.cloneJob.update({
      where: { id: jobId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { pages: [...base, ...created] as any },
    });
    await flushLangfuse();

    return NextResponse.json({ success: true, added: created.length });
  } catch (error) {
    console.error("[clone/fill-interior] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Regen-in-place route**

Create `apps/admin/src/app/api/clone/[jobId]/pages/[pageNumber]/regen/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { editImage } from "@vx/server-core/ai";
import { buildRedesignPrompt } from "@vx/server-core/ai/prompts";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import { flushLangfuse } from "@vx/server-core/langfuse";
import type { CloneJobPage } from "@vx/server-core/ai/clone-types";

export const maxDuration = 120;

type RouteParams = { params: Promise<{ jobId: string; pageNumber: string }> };

/** Regenerate an ADDITIONAL page in place: re-run image-to-image on its source
 *  (imageUrl = parent) at the operator-chosen change-%, overwriting redesignedUrl. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId, pageNumber } = await params;
    const pageNum = parseInt(pageNumber, 10);
    if (isNaN(pageNum)) return NextResponse.json({ error: "Invalid page number" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as { changePercent?: number };
    const pct = Math.min(95, Math.max(5, body.changePercent || 30));

    const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });
    if (!row) return NextResponse.json({ error: "Clone job not found" }, { status: 404 });

    const pages = (row.pages as CloneJobPage[]) || [];
    const idx = pages.findIndex((p) => p.pageNumber === pageNum);
    if (idx === -1) return NextResponse.json({ error: "Page not found" }, { status: 404 });
    if (pages[idx].origin !== "additional") {
      return NextResponse.json({ error: "Only additional pages can be regenerated in place" }, { status: 400 });
    }

    const img = await editImage(resolveR2Url(pages[idx].imageUrl), buildRedesignPrompt(pct), {
      trace: { caller: "clone/page-regen", entityType: "cloneJob", entityId: jobId },
    });
    const base64 = img.base64 || img.dataUrl?.split(",")[1] || "";
    const buffer = Buffer.from(base64, "base64");
    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const key = `assets/clone-jobs/${jobId}/redesigned/page-${String(pageNum).padStart(3, "0")}.png`;
    const { url } = await uploadToR2({ client: r2Client, config: r2Config, key, body: buffer, contentType: "image/png" });

    const updated = [...pages];
    updated[idx] = { ...updated[idx], redesignedUrl: `${url}?v=${Date.now()}` };
    await prisma.cloneJob.update({
      where: { id: jobId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { pages: updated as any },
    });
    await flushLangfuse();

    return NextResponse.json({ success: true, url });
  } catch (error) {
    console.error("[clone/page-regen] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Add `DELETE` to the page route**

In `apps/admin/src/app/api/clone/[jobId]/pages/[pageNumber]/route.ts`, add the import at the top (keep the existing ones):
```ts
import type { CloneJobPage } from "@vx/server-core/ai/clone-types";
```
(already imported — reuse it) and append a `DELETE` handler after the existing `PUT`:
```ts
/** Delete an ADDITIONAL page (Xóa). Originals are never deletable here. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId, pageNumber } = await params;
    const pageNum = parseInt(pageNumber, 10);
    if (isNaN(pageNum)) return NextResponse.json({ error: "Invalid page number" }, { status: 400 });

    const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });
    if (!row) return NextResponse.json({ error: "Clone job not found" }, { status: 404 });

    const pages = (row.pages as CloneJobPage[]) || [];
    const target = pages.find((p) => p.pageNumber === pageNum);
    if (!target) return NextResponse.json({ error: "Page not found" }, { status: 404 });
    if (target.origin !== "additional") {
      return NextResponse.json({ error: "Only additional pages can be deleted" }, { status: 400 });
    }

    const remaining = pages.filter((p) => p.pageNumber !== pageNum);
    await prisma.cloneJob.update({
      where: { id: jobId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { pages: remaining as any },
    });
    return NextResponse.json({ success: true, removed: pageNum });
  } catch (error) {
    console.error("[clone/delete-page] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/admin && yarn typecheck`
Expected: no errors. (Confirms `@vx/clone-core` exports `planFillInterior`/`DEFAULT_TARGET_INTERIOR` and that `editImage`/R2 signatures match — same as the existing `redesign-page` route.)

- [ ] **Step 5: Reasoning check**

- Fill route recomputes `need` each call → safe to press repeatedly; adds 0 when already at target.
- Regen + Delete both reject non-additional pages with 400 → originals protected.
- Regen re-anchors on `imageUrl` (the parent source), not on the current `redesignedUrl`, so higher % genuinely diverges instead of compounding. Cache-buster `?v=` forces the UI to reload.

- [ ] **Step 6: Commit**

```bash
git add "apps/admin/src/app/api/clone/[jobId]/fill-interior/route.ts" \
  "apps/admin/src/app/api/clone/[jobId]/pages/[pageNumber]/regen/route.ts" \
  "apps/admin/src/app/api/clone/[jobId]/pages/[pageNumber]/route.ts"
git commit -m "feat(api): clone fill-interior + additional-page regen/delete routes (D3 T-006/009)"
```

---

## Task 6: Coloring data hook + `deriveAdditionalMeta`

**Files:**
- Create: `packages/coloring/src/data/use-fill-interior.ts`
- Test: `packages/coloring/src/data/use-fill-interior.test.ts`

**Interfaces:**
- Consumes: `httpPost` from `@vx/core-uikit/api`; `COLORING_API_BASE`, `COLORING_WRITE_ENABLED` from `./config`; `CloneJobPage` from `./types`.
- Produces:
  - `interface AdditionalMeta { isAdditional: boolean; displayNumber: string; parentPageNumber?: number }`
  - `function deriveAdditionalMeta(page: CloneJobPage, allPages: CloneJobPage[]): AdditionalMeta`
  - `function interiorProgress(pages: CloneJobPage[]): { count: number }` — interior !excluded count.
  - `function useFillInterior(jobId: string)` → `{ enabled, fill(): Promise<void>, regen(pageNumber, changePercent): Promise<void>, remove(pageNumber): Promise<void> }`

- [ ] **Step 1: Write the failing test**

Create `packages/coloring/src/data/use-fill-interior.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { deriveAdditionalMeta, interiorProgress } from "./use-fill-interior";
import type { CloneJobPage } from "./types";

const p = (o: Partial<CloneJobPage> & { pageNumber: number }): CloneJobPage => ({
  imageUrl: "/x.png",
  status: "analyzed",
  ...o,
});

describe("deriveAdditionalMeta", () => {
  const pages: CloneJobPage[] = [
    p({ pageNumber: 12, pageType: "interior", origin: "original" }),
    p({ pageNumber: 41, pageType: "interior", origin: "additional", parentPageNumber: 12 }),
    p({ pageNumber: 42, pageType: "interior", origin: "additional", parentPageNumber: 12 }),
    p({ pageNumber: 43, pageType: "interior", origin: "additional", parentPageNumber: 8 }),
  ];

  it("labels an original by its own number", () => {
    expect(deriveAdditionalMeta(pages[0], pages)).toEqual({
      isAdditional: false,
      displayNumber: "#12",
      parentPageNumber: undefined,
    });
  });

  it("numbers additionals per-parent as #<parent>·A<n>", () => {
    expect(deriveAdditionalMeta(pages[1], pages).displayNumber).toBe("#12·A1");
    expect(deriveAdditionalMeta(pages[2], pages).displayNumber).toBe("#12·A2");
    // different parent restarts the counter
    expect(deriveAdditionalMeta(pages[3], pages).displayNumber).toBe("#8·A1");
  });
});

describe("interiorProgress", () => {
  it("counts interior pages that are not excluded", () => {
    const pages: CloneJobPage[] = [
      p({ pageNumber: 1, pageType: "cover" }),
      p({ pageNumber: 2, pageType: "interiorIntro" }),
      p({ pageNumber: 3, pageType: "interior" }),
      p({ pageNumber: 4, pageType: "interior", excluded: true }),
      p({ pageNumber: 5, origin: "additional", pageType: "interior", parentPageNumber: 3 }),
      p({ pageNumber: 6 }), // legacy undefined → interior
    ];
    expect(interiorProgress(pages).count).toBe(3); // pages 3, 5, 6
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/coloring && yarn vitest run src/data/use-fill-interior.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the hook + helpers**

Create `packages/coloring/src/data/use-fill-interior.ts`:
```ts
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost, httpDel } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";
import type { CloneJobPage } from "./types";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

const isInterior = (p: CloneJobPage): boolean =>
  p.pageType !== "cover" && p.pageType !== "interiorIntro";

export interface AdditionalMeta {
  isAdditional: boolean;
  displayNumber: string;
  parentPageNumber?: number;
}

/** Derive the display label + additional flag for a page (nothing stored in DB). */
export function deriveAdditionalMeta(page: CloneJobPage, allPages: CloneJobPage[]): AdditionalMeta {
  if (page.origin !== "additional" || page.parentPageNumber == null) {
    return { isAdditional: false, displayNumber: `#${page.pageNumber}`, parentPageNumber: undefined };
  }
  const siblings = allPages
    .filter((q) => q.origin === "additional" && q.parentPageNumber === page.parentPageNumber)
    .sort((a, b) => a.pageNumber - b.pageNumber);
  const n = siblings.findIndex((q) => q.pageNumber === page.pageNumber) + 1;
  return {
    isAdditional: true,
    displayNumber: `#${page.parentPageNumber}·A${n}`,
    parentPageNumber: page.parentPageNumber,
  };
}

/** Interior (!excluded) page count — the numerator of the progress header. */
export function interiorProgress(pages: CloneJobPage[]): { count: number } {
  return { count: pages.filter((p) => isInterior(p) && !p.excluded).length };
}

/** D3 write actions (all behind the staging write flag). */
export function useFillInterior(jobId: string) {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ["coloring", "clone-job", jobId] });
  const base = `${COLORING_API_BASE}/clone/${encodeURIComponent(jobId)}`;
  const guard = () => {
    if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
  };

  return {
    enabled: COLORING_WRITE_ENABLED,
    fill: async () => {
      guard();
      await httpPost(`${base}/fill-interior`, {});
      inval();
    },
    regen: async (pageNumber: number, changePercent: number) => {
      guard();
      await httpPost(`${base}/pages/${pageNumber}/regen`, { changePercent });
      inval();
    },
    remove: async (pageNumber: number) => {
      guard();
      await httpDel(`${base}/pages/${pageNumber}`);
      inval();
    },
  };
}
```

> **Verified:** `@vx/core-uikit/api` exports `httpDel` (not `httpDelete`) — `httpDel<T>(url, data?)` maps to an HTTP DELETE (`packages/core-uikit/src/api/http-client.ts:221`, re-exported at `index.ts:25`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/coloring && yarn vitest run src/data/use-fill-interior.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `cd apps/admin && yarn typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/coloring/src/data/use-fill-interior.ts packages/coloring/src/data/use-fill-interior.test.ts
git commit -m "feat(coloring): use-fill-interior hook + deriveAdditionalMeta helper (D3 T-008)"
```

---

## Task 7: JobCompareTab UI — progress header, orange strip, additional panel

**Files:**
- Modify: `packages/coloring/src/screens/jobs/job-compare-tab.tsx`

**Interfaces:**
- Consumes: `useFillInterior`, `deriveAdditionalMeta`, `interiorProgress` (Task 6); existing `Candidate`, `resolveImg`, `usePipelineActions`.
- Produces: no new exports (internal UI only).

- [ ] **Step 1: Add imports + hook wiring**

At the top of `packages/coloring/src/screens/jobs/job-compare-tab.tsx`, add after the existing `use-pipeline-actions` import (line 11):
```ts
import { useFillInterior, deriveAdditionalMeta, interiorProgress } from "../../data/use-fill-interior";
```
Inside `JobCompareTab`, after `const pa = usePipelineActions(jobId);` (line 102):
```ts
  const fi = useFillInterior(jobId);
  const target = 40; // display-only default; server enforces job.data.targetInteriorCount
  const progress = interiorProgress(pages);
```

- [ ] **Step 2: Add the progress header**

Immediately after the opening `<Card title="So sánh & chọn redesign theo trang">` (line 216), insert:
```tsx
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid var(--border)" }}>
        <span style={capLabel}>Interior</span>
        <span style={{ ...mono, fontWeight: 700 }}>{progress.count}/{target}</span>
        {progress.count < target && (
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>còn thiếu {target - progress.count}</span>
        )}
        <span style={{ flex: 1 }} />
        <Button variant="outline" size="sm" disabled={!fi.enabled || busy !== null}
          title={fi.enabled ? "Nhân bản thêm interior cho đủ target" : "Cần bật ghi thật (staging)"}
          onClick={run("fill", () => fi.fill())}>
          <Icon name="sparkles" size={14} /> {busy === "fill" ? "Đang fill…" : "Fill thêm cho đủ"}
        </Button>
      </div>
```

- [ ] **Step 3: Mark additional thumbnails orange in the strip**

In the strip `pages.map(...)` (line 220), compute meta per page and tint the border/background. Replace the `const has = Boolean(reproduced(p));` line with:
```ts
            const has = Boolean(reproduced(p));
            const meta = deriveAdditionalMeta(p, pages);
```
Then change the thumbnail wrapper `border`/`background` to highlight additionals — replace the inline `border: ...` on the strip item `<div>` with:
```ts
              border: `${active ? 2 : 1}px solid ${active ? "var(--volt-600)" : meta.isAdditional ? "var(--warning)" : "var(--border)"}`,
              background: meta.isAdditional ? "color-mix(in srgb, var(--warning) 14%, var(--neutral-100))" : "var(--neutral-100)",
```
And replace the page-number badge text `{String(p.pageNumber).padStart(2, "0")}` with the derived label:
```tsx
{meta.isAdditional ? meta.displayNumber : String(p.pageNumber).padStart(2, "0")}
```

- [ ] **Step 4: Render the additional panel instead of the 4-slot reproduce panel**

The selected page is `page` (line 137). Compute its meta and parent once, right after `const redo = reproduced(page);` (line 138):
```ts
  const selMeta = deriveAdditionalMeta(page, pages);
  const parentPage = selMeta.isAdditional
    ? pages.find((p) => p.pageNumber === page.parentPageNumber)
    : undefined;
```
Then wrap the existing 4-slot `<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16 }}> … </div>` (lines 297-324) so additionals get a dedicated panel. Replace that whole grid block with:
```tsx
          {selMeta.isAdditional ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Badge tone="warning" dot>Additional {selMeta.displayNumber}</Badge>
                <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>nhân bản từ trang gốc #{page.parentPageNumber}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16 }}>
                <Candidate label={`Hình gốc #${page.parentPageNumber ?? "?"}`} src={resolveImg(parentPage?.imageUrl ?? page.imageUrl)} />
                <Candidate
                  label="Bản additional"
                  src={resolveImg(page.redesignedUrl)}
                  hint="Đang dùng"
                  empty
                  disabled={!fi.enabled}
                  busy={busy === "aregen"}
                  regen={{ label: "Regen (thay tại chỗ)", busy: busy === "aregen", onClick: run("aregen", () => fi.regen(page.pageNumber, changePct)) }}
                  footer={
                    <Button variant="ghost" size="sm" style={{ width: "100%" }} disabled={!fi.enabled || busy !== null}
                      onClick={run("adelete", () => fi.remove(page.pageNumber), "Xóa trang additional này? Số interior sẽ giảm.")}>
                      <Icon name="trash-2" size={14} /> Xóa
                    </Button>
                  }
                />
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16 }}>
              <Candidate label="Hình gốc" src={resolveImg(page.imageUrl)} footer={
                <Button variant="ghost" size="sm" style={{ width: "100%" }} disabled={!styleSvc.enabled || busy !== null || !page.imageUrl}
                  title={styleSvc.enabled ? "Analyze hình gốc (màu) → tạo coloring style tái sử dụng" : "Cần bật ghi thật (staging)"}
                  onClick={saveColoringStyle}>
                  <Icon name="palette" size={14} /> {busy === "savestyle" ? "Đang lưu…" : "Lưu coloring style"}
                </Button>
              } />
              <Candidate
                label="Bản đã gen"
                src={idx === 0 ? (coverUrl ?? resolveImg(redo)) : resolveImg(redo)}
                hint={idx === 0 ? (coverUrl ? "Cover đang dùng" : undefined) : (redo ? "Đang dùng" : undefined)}
                empty
                footer={idx === 0 && bookId ? (
                  <Button variant="outline" size="sm" style={{ width: "100%" }} onClick={() => router.push(`${B}/books/${bookId}/cover`)}>
                    <Icon name="image" size={14} /> Sửa bìa
                  </Button>
                ) : undefined}
              />
              <Candidate label="Regen" src={resolveImg(regenCand)} selected={!!regenCand && page.reproducedUrl === regenCand} empty
                disabled={!pa.enabled} busy={busy === "applyregen"}
                onChoose={run("applyregen", () => pa.applyCandidate(idx, "regen"))}
                regen={{ label: regenCand ? "Regen lại" : "Tạo bản regen", busy: busy === "genregen", onClick: run("genregen", () => pa.regenCandidate(idx, false, changePct)) }} />
              <Candidate label={angleView ? `Đổi camera · ${angleView}` : "Đổi camera"} src={resolveImg(angle)} hint={angle ? "Góc mới" : undefined} selected={!!angle && page.reproducedUrl === angle} empty
                disabled={!pa.enabled} busy={busy === "applyangle"}
                onChoose={run("applyangle", () => pa.applyCandidate(idx, "angle"))}
                regen={{ label: angle ? "Đổi góc khác" : "Tạo góc mới", busy: busy === "genangle", onClick: run("genangle", () => pa.regenCandidate(idx, true, changePct)) }} />
            </div>
          )}
```
(The `else` branch is the EXISTING 4-slot grid verbatim — moved inside the conditional. Icon `"trash-2"` is verified present in `packages/coloring/src/lib/icon.tsx:101`.)

- [ ] **Step 5: Typecheck**

Run: `cd apps/admin && yarn typecheck`
Expected: no errors.

- [ ] **Step 6: Run coloring tests**

Run: `cd packages/coloring && yarn test`
Expected: PASS (existing suite + the new `use-fill-interior` tests).

- [ ] **Step 7: Manual verification (dev, staging write enabled)**

With the tunnel + admin dev running (`http://localhost:3000`), open a job that has reached the compare tab:
- Header shows `Interior: N/40` + "Fill thêm cho đủ".
- Additional thumbnails appear orange with `#P·An` labels after a fill.
- Selecting an additional shows Parent↔Additional with Regen + Xóa; selecting an original shows the original 4-slot panel unchanged.
(Regen/Fill/Delete buttons only actually fire when `COLORING_WRITE_ENABLED` — they mutate real prod data over the tunnel; use with care.)

- [ ] **Step 8: Commit**

```bash
git add packages/coloring/src/screens/jobs/job-compare-tab.tsx
git commit -m "feat(coloring): fill-interior progress + additional page panel in compare tab (D3 T-008/009)"
```

---

## Self-Review

**Spec coverage (§ of `2026-08-11-d3-...-design.md`):**
- §2 Q1 target global+per-job → Task 1 (`targetInteriorCount`) + `DEFAULT_TARGET_INTERIOR` (Task 2), read in step (Task 3) + fill route (Task 5). ✅
- §2 Q2 auto + manual fill → Task 3 (auto in pipeline) + Task 5 fill route + Task 7 button. ✅
- §2 Q3 store origin+parent only, derive rest → Task 1 (fields) + Task 6 (`deriveAdditionalMeta`). ✅
- §2 Q4 gộp vào JobCompareTab → Task 7. ✅
- §2 N1 pageNumber max+1 → planner `nextSeq` (Task 2). ✅
- §2 N2 escalation 40/+10/cap80 + operator regen % → Task 2 (planner) + Task 5 (regen route reads body) + Task 7 (passes `changePct`). ✅
- §2 N3 no Accept → Task 7 renders only Regen + Xóa. ✅
- §4 stepFillInterior placement after gate → Task 3. ✅
- §5 three routes → Task 5. ✅
- §7 create-book sort → Task 4. ✅

**Placeholder scan:** every code step has full code; test steps have real commands + expected output; two `git grep` verification notes (httpDelete, icon names) are explicit fallbacks, not TODOs. ✅

**Type consistency:** `planFillInterior(pages, target, { shuffle })` signature identical across Task 2 (def), Task 3 (`stepFillInterior`), Task 5 (fill route). `FillTask` fields (`sourceImageUrl`, `parentPageNumber`, `pageNumber`, `changePercent`) used identically in Task 2/3/5. `origin: "original" | "additional"` and `parentPageNumber?: number` identical in server-core + coloring types (Task 1), planner input (Task 2), created pages (Task 3/5), and UI derive (Task 6). Step string `"fill-interior"` identical in `STEP_ORDER` (Task 1), `withRetry`/`isDone`/`markStepComplete` (Task 3). `DEFAULT_TARGET_INTERIOR` used in step + route. `deriveAdditionalMeta`/`interiorProgress`/`useFillInterior` names identical in Task 6 (def) and Task 7 (use). ✅
