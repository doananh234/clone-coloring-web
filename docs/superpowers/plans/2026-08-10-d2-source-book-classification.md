# D2 — Source Book Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify every clone-job page as `cover` / `interiorIntro` / `interior` (with an `excluded` flag), pause the pipeline for a mandatory operator review gate, then build the Book so cover→`coverUrl`, intro→`summaryPages[]`, interior→`coloringPages[]`, excluded→dropped.

**Architecture:** Auto-classify seeds a `pageType` on each `JobPage` during `stepOneShot` (reusing the LLM's existing `isCover` signal + a page-1 fallback). After reproduce, the worker pauses at a **gate** (status `awaiting-classify`) instead of running `create-book`. A new `classify` API route persists operator edits and, on confirm, flips `data.classifyConfirmed = true` and re-enqueues the job — the worker resumes past the gate straight into `create-book`, which now partitions pages by `pageType`. A gate-review tab in the job detail screen drives the whole thing.

**Tech Stack:** TypeScript, Prisma (JSON columns — no migration), BullMQ worker (`apps/worker`), Next.js API routes (`apps/admin`), React (`@vx/coloring`), Vitest.

## Global Constraints

- **No Prisma migration.** `pageType`/`excluded` live inside the existing `CloneJob.pages` JSON and `data` JSON — add only optional fields. (Ref spec §4.2.)
- **Backward compatible.** A page with no `pageType` MUST be treated as `interior`; legacy jobs/books already shipped are NOT backfilled (spec §9 — "chỉ job mới").
- **`coverUrl` stays a mirror.** `Book.coverUrl` must always point at a valid, moved image so list/thumbnail/PDF don't break (spec §9).
- **Gate placement is fixed:** after `stepOneShot`/reproduce, **before** `create-book` — the default pipeline is one-shot which already redesigned the pages (decision 2026-08-10, spec §4.4). Do NOT try to split one-shot.
- **Worker DB writes use `updateMany`** for CloneJob (a job can be deleted mid-flight — see `job-context.ts` note). Match that pattern in the worker step; the admin API route may use `update`.
- **Taxonomy is exactly 3 types** + a separate `excluded: boolean` (spec §4.1). `excluded` is inclusion, not a 4th type.
- Background colors for badges (spec §3.3): `interiorIntro` = amber, `cover` = indigo, `interior` = default, `excluded` = dim + strikethrough.

---

## File Structure

**New files:**
- `packages/clone-core/src/steps/classify-page.ts` — pure `classifyPage()` heuristic + `PageType` type.
- `packages/clone-core/src/steps/classify-page.test.ts` — unit tests for the heuristic.
- `apps/admin/src/app/api/clone/[jobId]/classify/route.ts` — save classifications + confirm/resume.
- `packages/coloring/src/data/use-classify-gate.ts` — React hook: save + confirm.
- `packages/coloring/src/data/use-classify-gate.test.ts` — hook test.
- `packages/coloring/src/screens/jobs/job-classify-tab.tsx` — the gate review UI.

**Modified files:**
- `packages/server-core/src/ai/clone-types.ts` — add `pageType`/`excluded` to `CloneJobPage`; add `awaiting-classify` to status union.
- `packages/clone-core/src/steps/one-shot.ts` — call `classifyPage()` when building each `jobPage`.
- `packages/clone-core/src/steps/one-shot.test.ts` — assert pageType is written.
- `apps/worker/src/processor/clone-job-processor.ts` — insert the gate check before `create-book`.
- `packages/clone-core/src/steps/create-book.ts` — partition pages by `pageType`/`excluded`.
- `packages/clone-core/src/steps/create-book.test.ts` — cover/intro/interior/excluded partitioning tests.
- `apps/admin/src/app/api/clone/[jobId]/create-book/route.ts` — same partition (manual-route parity).
- `packages/coloring/src/data/types.ts` — add `pageType`/`excluded` to the UI `CloneJobPage`; add status.
- `packages/coloring/src/data/status.ts` — `metaFor("awaiting-classify")` label/tone.
- `packages/coloring/src/screens/jobs/job-detail-screen.tsx` — mount the classify tab.

---

## Task 1: Classification data model + `classifyPage` heuristic

**Files:**
- Create: `packages/clone-core/src/steps/classify-page.ts`
- Test: `packages/clone-core/src/steps/classify-page.test.ts`
- Modify: `packages/server-core/src/ai/clone-types.ts:45-68` (add fields), `:92-107` (status union)

**Interfaces:**
- Produces: `type PageType = "cover" | "interiorIntro" | "interior"`
- Produces: `classifyPage(input: { pageNumber: number; isCover?: boolean; coverAlreadyAssigned?: boolean }): { pageType: PageType; excluded: boolean }`
- Consumed by: Task 2 (`stepOneShot`), Task 5 (`stepCreateBook` reads `pageType`/`excluded`), Task 6 (UI).

**Decision (read before coding):** Auto-classify only distinguishes **cover vs interior** — there is no reliable "intro" signal in the analyze output, so `interiorIntro` is left for the operator to assign at the gate. `excluded` always defaults `false` (operator toggles it). This keeps the heuristic honest while the 3-type taxonomy is fully supported downstream.

- [ ] **Step 1: Write the failing test**

Create `packages/clone-core/src/steps/classify-page.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyPage } from "./classify-page";

describe("classifyPage", () => {
  it("tags the LLM-flagged cover page as cover", () => {
    expect(classifyPage({ pageNumber: 4, isCover: true })).toEqual({
      pageType: "cover",
      excluded: false,
    });
  });

  it("falls back to page 1 as cover when the LLM did not flag one", () => {
    expect(classifyPage({ pageNumber: 1, isCover: false })).toEqual({
      pageType: "cover",
      excluded: false,
    });
  });

  it("does NOT make page 1 a cover when another page was already flagged cover", () => {
    expect(
      classifyPage({ pageNumber: 1, isCover: false, coverAlreadyAssigned: true }),
    ).toEqual({ pageType: "interior", excluded: false });
  });

  it("treats every other page as interior, never excluded automatically", () => {
    expect(classifyPage({ pageNumber: 7 })).toEqual({
      pageType: "interior",
      excluded: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/clone-core && yarn vitest run src/steps/classify-page.test.ts`
Expected: FAIL — "Failed to resolve import ./classify-page" / "classifyPage is not a function".

- [ ] **Step 3: Write minimal implementation**

Create `packages/clone-core/src/steps/classify-page.ts`:

```ts
export type PageType = "cover" | "interiorIntro" | "interior";

export interface ClassifyPageInput {
  /** 1-based page position in the source book. */
  pageNumber: number;
  /** LLM analyze signal (Diaflow emits `isCover: true` on cover-style pages). */
  isCover?: boolean;
  /** True once an earlier page has already been assigned `cover` this run. */
  coverAlreadyAssigned?: boolean;
}

export interface ClassifyPageResult {
  pageType: PageType;
  excluded: boolean;
}

/**
 * Seed auto-classification for a clone-job page.
 *
 * Auto-classify only decides cover-vs-interior: the LLM's `isCover` is the
 * primary signal, with page 1 as a fallback cover when nothing was flagged.
 * `interiorIntro` has no reliable auto signal, so it is left for the operator
 * to assign at the review gate. `excluded` always defaults false — the gate is
 * where back covers / blanks / junk get toggled out.
 */
export function classifyPage(input: ClassifyPageInput): ClassifyPageResult {
  const isCover =
    input.isCover === true ||
    (input.pageNumber === 1 && !input.coverAlreadyAssigned);
  return { pageType: isCover ? "cover" : "interior", excluded: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/clone-core && yarn vitest run src/steps/classify-page.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the fields to the shared types**

In `packages/server-core/src/ai/clone-types.ts`, extend `CloneJobPage` (after the `error?: string;` line at :67):

```ts
export type CloneJobPage = {
  pageNumber: number;
  imageUrl: string;
  status: "pending" | "analyzing" | "analyzed" | "error";
  rawData?: ClonePageRawData;
  /** URL of the redesigned version (image-to-image from original + prompt) */
  redesignedUrl?: string;
  /** Prompt used for redesign */
  redesignPrompt?: string;
  reproducedUrl?: string;
  regenCandidateUrl?: string;
  angleCandidateUrl?: string;
  angleCandidateView?: string;
  error?: string;
  /** D2 classification — undefined = legacy page, treated as "interior". */
  pageType?: "cover" | "interiorIntro" | "interior";
  /** D2 inclusion flag — true drops the page from the built Book. */
  excluded?: boolean;
};
```

And add the gate status to the `CloneJob["status"]` union (at :95-107), inserting `"awaiting-classify"` after `"reproduced"`:

```ts
  status:
    | "uploading"
    | "extracted"
    | "analyzing"
    | "analyzed"
    | "confirmed"
    | "entities_ready"
    | "reproduced"
    | "awaiting-classify"
    | "error"
    | "pending"
    | "queued"
    | "stashed"
    | "running";
```

- [ ] **Step 6: Typecheck the touched packages**

Run: `cd packages/clone-core && yarn vitest run && cd ../server-core && yarn tsc --noEmit`
Expected: clone-core tests PASS; server-core typecheck clean (no usages break — fields are optional).

- [ ] **Step 7: Commit**

```bash
git add packages/clone-core/src/steps/classify-page.ts packages/clone-core/src/steps/classify-page.test.ts packages/server-core/src/ai/clone-types.ts
git commit -m "feat(clone): classifyPage heuristic + pageType/excluded fields (D2 T-003)"
```

---

## Task 2: Auto-classify pages inside `stepOneShot`

**Files:**
- Modify: `packages/clone-core/src/steps/one-shot.ts:54-62` (JobPage interface), `:203-229` (build loop)
- Test: `packages/clone-core/src/steps/one-shot.test.ts`

**Interfaces:**
- Consumes: `classifyPage`, `PageType` from Task 1.
- Produces: every committed `jobPage` carries `pageType` (cover/interior). Consumed by Task 5 + Task 6.

- [ ] **Step 1: Write the failing test**

Append to `packages/clone-core/src/steps/one-shot.test.ts` (inside the file's top-level `describe`, or add a new `describe`). This asserts the page the LLM flags `isCover` becomes `cover` and the rest become `interior`. Mirror the file's existing mock setup for `deps`; the key assertion is on the `pages` written via `cloneJob.updateMany`:

```ts
import { classifyPage } from "./classify-page";

describe("stepOneShot — D2 auto-classify", () => {
  it("writes pageType=cover on the isCover page and interior elsewhere", async () => {
    // Arrange: a 3-page one-shot result where page 2 is the LLM cover.
    const pagesOut: unknown[] = [];
    const db = {
      cloneJob: {
        findUnique: vi.fn().mockResolvedValue({
          id: "j1",
          sourcePdfUrl: "assets/clone-jobs/j1/src.pdf",
          data: {},
          bookData: {},
          pages: [
            { pageNumber: 1, imageUrl: "o1", status: "rendered" },
            { pageNumber: 2, imageUrl: "o2", status: "rendered" },
            { pageNumber: 3, imageUrl: "o3", status: "rendered" },
          ],
        }),
        update: vi.fn().mockResolvedValue(undefined),
        updateMany: vi.fn().mockImplementation(async (arg: { data?: { pages?: unknown[] } }) => {
          if (arg.data?.pages) pagesOut.splice(0, pagesOut.length, ...arg.data.pages);
        }),
      },
      sourceBook: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
    } as never;

    const ctx = {
      jobId: "j1",
      sourceBookId: undefined,
      isDone: () => false,
      markStepComplete: vi.fn().mockResolvedValue(undefined),
    } as never;

    const deps = {
      runOneShot: vi.fn().mockResolvedValue({
        sessionId: "s1",
        pages: [
          { redesignedImageUrl: "r1", analyzeData: { isCover: false } },
          { redesignedImageUrl: "r2", analyzeData: { isCover: true } },
          { redesignedImageUrl: "r3", analyzeData: { isCover: false } },
        ],
      }),
      fetchImage: vi.fn().mockResolvedValue({ body: Buffer.from(""), contentType: "image/png" }),
      uploadToR2: vi.fn().mockResolvedValue({ url: "https://r2/red.png" }),
      resolveR2Url: (k: string) => `https://r2/${k}`,
    };

    await stepOneShot(ctx, db, deps);

    const written = pagesOut as Array<{ pageNumber: number; pageType?: string }>;
    expect(written.find((p) => p.pageNumber === 2)?.pageType).toBe("cover");
    expect(written.find((p) => p.pageNumber === 1)?.pageType).toBe("interior");
    expect(written.find((p) => p.pageNumber === 3)?.pageType).toBe("interior");
    // sanity: helper agrees
    expect(classifyPage({ pageNumber: 2, isCover: true }).pageType).toBe("cover");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/clone-core && yarn vitest run src/steps/one-shot.test.ts -t "auto-classify"`
Expected: FAIL — `pageType` is `undefined` (not yet written).

- [ ] **Step 3: Wire `classifyPage` into the build loop**

In `packages/clone-core/src/steps/one-shot.ts`:

First, import the helper at the top of the file (after existing imports):

```ts
import { classifyPage, type PageType } from "./classify-page";
```

Add the fields to the local `JobPage` interface (:54-62):

```ts
interface JobPage {
  pageNumber: number;
  imageUrl: string;
  status: string;
  rawData?: unknown;
  redesignedUrl?: string;
  redesignPrompt?: string;
  error?: string;
  pageType?: PageType;
  excluded?: boolean;
}
```

Then, inside the `for` loop, on the SUCCESS `jobPages.push({...})` (currently :223-229), compute and attach the classification. Track whether a cover has been assigned so page-1 fallback doesn't double-assign:

```ts
  // (declare once, just before the `for (let i = 0; ...)` loop at ~:158)
  let coverAlreadyAssigned = false;
```

Replace the success push (:223-229) with:

```ts
      const isCover = (analyze as { isCover?: unknown }).isCover === true;
      const { pageType, excluded } = classifyPage({
        pageNumber,
        isCover,
        coverAlreadyAssigned,
      });
      if (pageType === "cover") coverAlreadyAssigned = true;

      jobPages.push({
        pageNumber,
        imageUrl: renderedOriginal,
        redesignedUrl: redesignedR2Url,
        status: "reproduced",
        rawData,
        pageType,
        excluded,
      });
```

(The error push at :237-242 stays as-is — a failed page gets no `pageType`; create-book already drops `status === "error"` pages.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/clone-core && yarn vitest run src/steps/one-shot.test.ts`
Expected: PASS (existing one-shot tests + the new auto-classify test).

- [ ] **Step 5: Commit**

```bash
git add packages/clone-core/src/steps/one-shot.ts packages/clone-core/src/steps/one-shot.test.ts
git commit -m "feat(clone): auto-classify pageType during stepOneShot (D2 T-003)"
```

---

## Task 3: Pause the worker at the classification gate

**Files:**
- Modify: `apps/worker/src/processor/clone-job-processor.ts:83-88` (insert gate before create-book)

**Interfaces:**
- Consumes: `CloneJob.data.classifyConfirmed?: boolean` (written by Task 4's route).
- Produces: when unconfirmed, sets `status = "awaiting-classify"` and returns without building the book. When confirmed, falls through to `create-book` unchanged.

- [ ] **Step 1: Insert the gate**

In `apps/worker/src/processor/clone-job-processor.ts`, between the pipeline `if (useMultiStep) {…} else {…}` block (ends :83) and the `const bookId = …` line (:85), insert:

```ts
    // D2 gate — pause for the operator's classification review before building
    // the Book. The default one-shot pipeline has already reproduced the pages
    // by this point (spec §4.4), so the gate lands here: after reproduce,
    // before create-book. Resumed by POST /api/clone/[jobId]/classify with
    // { confirm: true }, which sets classifyConfirmed and re-enqueues the job —
    // on the second run download/render/reproduce are all `isDone`, so the
    // worker skips straight back to this check (now passing) and continues.
    const gateRow = await db.cloneJob.findUnique({
      where: { id: jobId },
      select: { data: true },
    });
    const gateData = (gateRow?.data as { classifyConfirmed?: boolean } | null | undefined) ?? {};
    if (!gateData.classifyConfirmed) {
      await db.cloneJob.updateMany({
        where: { id: jobId },
        data: { status: "awaiting-classify" },
      });
      console.log(`[worker] clone job ${jobId} paused at classify gate`);
      return;
    }
```

- [ ] **Step 2: Typecheck the worker**

Run: `cd apps/worker && yarn tsc --noEmit`
Expected: clean. (`"awaiting-classify"` is a plain string in the Prisma `status` column, so no enum change is needed on the DB side.)

- [ ] **Step 3: Manual reasoning check (no automated worker test harness)**

Confirm by re-reading: on first run the job reaches the gate with `classifyConfirmed` unset → status becomes `awaiting-classify`, `currentStep` stays `reproduce`, worker returns. `markComplete`/`notifySuccess` are NOT called. On re-enqueue after confirm, `isDone("reproduce")` is true so `stepOneShot` is skipped, the gate passes, and `create-book` runs. Write this reasoning in the commit body.

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/processor/clone-job-processor.ts
git commit -m "feat(worker): pause clone pipeline at D2 classify gate before create-book"
```

---

## Task 4: `classify` API route — save edits + confirm/resume

**Files:**
- Create: `apps/admin/src/app/api/clone/[jobId]/classify/route.ts`

**Interfaces:**
- Request `PATCH` body: `{ pages: Array<{ pageNumber: number; pageType?: "cover"|"interiorIntro"|"interior"; excluded?: boolean }>; confirm?: boolean }`
- Produces: merges edits into `CloneJob.pages` by `pageNumber`; when `confirm: true`, sets `data.classifyConfirmed = true`, status `queued`, and enqueues. Response `{ ok: true, confirmed: boolean }`.
- Consumed by: Task 6 hook.

- [ ] **Step 1: Write the route**

Create `apps/admin/src/app/api/clone/[jobId]/classify/route.ts` (mirrors `start/route.ts` for the enqueue and `create-book/route.ts` for typing):

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import type { CloneJobPage } from "@vx/server-core/ai/clone-types";
import { cloneQueue } from "@/lib/queue/clone-queue";
import { enqueueCloneJob } from "@vx/clone-core/queue-enqueue";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ jobId: string }> };
type Edit = { pageNumber: number; pageType?: CloneJobPage["pageType"]; excluded?: boolean };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { jobId } = await params;
  const body = (await req.json().catch(() => ({}))) as { pages?: Edit[]; confirm?: boolean };
  const edits = body.pages ?? [];
  const confirm = body.confirm === true;

  const row = await prisma.cloneJob.findUnique({ where: { id: jobId } });
  if (!row) return NextResponse.json({ error: "Clone job not found" }, { status: 404 });

  // Merge edits into pages by pageNumber (only overwrite provided fields).
  const editByPage = new Map(edits.map((e) => [e.pageNumber, e]));
  const pages = ((row.pages as CloneJobPage[] | null) ?? []).map((p) => {
    const e = editByPage.get(p.pageNumber);
    if (!e) return p;
    return {
      ...p,
      ...(e.pageType !== undefined ? { pageType: e.pageType } : {}),
      ...(e.excluded !== undefined ? { excluded: e.excluded } : {}),
    };
  });

  const prevData = (row.data as Record<string, unknown> | null) ?? {};
  await prisma.cloneJob.update({
    where: { id: jobId },
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pages: pages as any,
      ...(confirm
        ? { status: "queued", data: { ...prevData, classifyConfirmed: true } as never }
        : {}),
    },
  });

  if (confirm) {
    await enqueueCloneJob(cloneQueue, jobId);
  }

  return NextResponse.json({ ok: true, confirmed: confirm });
}
```

- [ ] **Step 2: Typecheck the admin app**

Run: `cd apps/admin && yarn tsc --noEmit`
Expected: clean. If the `@/lib/queue/clone-queue` import path differs, copy it verbatim from `apps/admin/src/app/api/clone/[jobId]/start/route.ts:3`.

- [ ] **Step 3: Smoke-test the route shape (optional, if a dev DB is reachable)**

Run the dev server, then:
`curl -X PATCH localhost:3000/api/clone/<jobId>/classify -H 'content-type: application/json' -d '{"pages":[{"pageNumber":1,"pageType":"cover"}]}'`
Expected: `{"ok":true,"confirmed":false}` and page 1 now has `pageType:"cover"` in the DB.

- [ ] **Step 4: Commit**

```bash
git add "apps/admin/src/app/api/clone/[jobId]/classify/route.ts"
git commit -m "feat(api): clone classify route — save page types + confirm/resume gate (D2)"
```

---

## Task 5: `create-book` partitions pages by classification

**Files:**
- Modify: `packages/clone-core/src/steps/create-book.ts:38-46` (JobPage interface), `:104-153` (partition + build)
- Test: `packages/clone-core/src/steps/create-book.test.ts`
- Modify (parity): `apps/admin/src/app/api/clone/[jobId]/create-book/route.ts:49-79`, `:131-132`

**Interfaces:**
- Consumes: `JobPage.pageType` / `JobPage.excluded` from Tasks 1–4.
- Produces: `Book.coverUrl` = moved cover image; `Book.summaryPages[]` = intro pages; `Book.coloringPages[]` = interior (+ legacy-undefined) pages; excluded pages dropped.

- [ ] **Step 1: Write the failing test**

Append to `packages/clone-core/src/steps/create-book.test.ts`. Use a job whose pages span all four buckets:

```ts
describe("stepCreateBook — D2 classification partitioning", () => {
  function fakeDbMixed() {
    const created: Array<{ table: string; data: unknown }> = [];
    return {
      created,
      db: {
        cloneJob: {
          findUnique: vi.fn().mockResolvedValue({
            id: "j1",
            name: "MyBook",
            bookData: {},
            pages: [
              { pageNumber: 1, imageUrl: "o1", redesignedUrl: "cover.png", pageType: "cover" },
              { pageNumber: 2, imageUrl: "o2", redesignedUrl: "intro.png", pageType: "interiorIntro" },
              { pageNumber: 3, imageUrl: "o3", redesignedUrl: "int3.png", pageType: "interior" },
              { pageNumber: 4, imageUrl: "o4", redesignedUrl: "int4.png", pageType: "interior", excluded: true },
              { pageNumber: 5, imageUrl: "o5", redesignedUrl: "legacy.png" }, // no pageType → interior
            ],
          }),
          update: vi.fn().mockResolvedValue(undefined),
        },
        book: {
          create: vi.fn().mockImplementation(async (arg: { data: unknown }) => {
            created.push({ table: "book", data: arg.data });
          }),
        },
      } as never,
    };
  }

  it("routes cover→coverUrl, intro→summaryPages, interior(+legacy)→coloringPages, drops excluded", async () => {
    const { db, created } = fakeDbMixed();
    const ctx = {
      jobId: "j1",
      resultBookId: undefined,
      sourceBookId: undefined,
      markStepComplete: vi.fn().mockResolvedValue(undefined),
    } as never;

    const bookId = await stepCreateBook(ctx, db, {
      randomUUID: () => "uuid-1",
      copyImage: async ({ destKey }: { sourceUrl: string; destKey: string }) => `/${destKey}`,
    });

    const book = created[0].data as {
      coverUrl: string;
      summaryPages: Array<{ url: string }>;
      coloringPages: Array<{ url: string }>;
    };
    // interior = pages 3 and 5 (legacy undefined counts as interior); 4 excluded
    expect(book.coloringPages).toHaveLength(2);
    // intro = page 2
    expect(book.summaryPages).toHaveLength(1);
    // cover image is moved and mirrored into coverUrl
    expect(book.coverUrl).toBe(`/assets/${bookId}/cover.png`);
    expect(book.coverUrl).not.toContain("clone-jobs");
  });

  it("falls back coverUrl to the first interior when no cover page exists", async () => {
    const { db, created } = fakeDbMixed();
    (db as { cloneJob: { findUnique: ReturnType<typeof vi.fn> } }).cloneJob.findUnique.mockResolvedValueOnce({
      id: "j1",
      name: "MyBook",
      bookData: {},
      pages: [{ pageNumber: 1, imageUrl: "o1", redesignedUrl: "int1.png", pageType: "interior" }],
    });
    const ctx = {
      jobId: "j1", resultBookId: undefined, sourceBookId: undefined,
      markStepComplete: vi.fn().mockResolvedValue(undefined),
    } as never;
    const bookId = await stepCreateBook(ctx, db, {
      randomUUID: () => "uuid-1",
      copyImage: async ({ destKey }: { sourceUrl: string; destKey: string }) => `/${destKey}`,
    });
    const book = created[0].data as { coverUrl: string; coloringPages: unknown[] };
    expect(book.coverUrl).toBe(`/assets/${bookId}/pages/page-001.png`);
    expect(book.coloringPages).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/clone-core && yarn vitest run src/steps/create-book.test.ts -t "classification partitioning"`
Expected: FAIL — currently every page lands in `coloringPages` and `summaryPages` is `[]`.

- [ ] **Step 3: Implement the partition**

In `packages/clone-core/src/steps/create-book.ts`:

Add fields to the local `JobPage` interface (:38-46):

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
}
```

Replace the block from `const usablePages = …` (:104) through the `const firstImage = …` line (:136) with:

```ts
  // A page is usable if it isn't an error page and has an image. Excluded
  // pages (operator-toggled back covers / blanks / junk) are dropped entirely.
  const usablePages = pages.filter(
    (p) => p.status !== "error" && !p.excluded && (p.redesignedUrl || p.imageUrl),
  );

  // Partition by D2 pageType. Legacy pages (no pageType) count as interior so
  // pre-D2 jobs behave exactly as before.
  const coverPage = usablePages.find((p) => p.pageType === "cover");
  const introPages = usablePages.filter((p) => p.pageType === "interiorIntro");
  const interiorPages = usablePages.filter(
    (p) => p.pageType !== "cover" && p.pageType !== "interiorIntro",
  );

  const buildPage = async (p: JobPage, destKey: string) => {
    const sourceUrl = p.redesignedUrl ?? p.imageUrl;
    const url = await deps.copyImage({ sourceUrl, destKey });
    return {
      id: deps.randomUUID(),
      url,
      isPublic: false,
      prompt: p.redesignPrompt || p.rawData?.reproductionPrompt || "",
      sceneData: normalizeRawData(p.rawData),
    };
  };

  const coloringPages = await Promise.all(
    interiorPages.map((p, i) => {
      const src = p.redesignedUrl ?? p.imageUrl;
      const ext = src.split(".").pop()?.split("?")[0] || "png";
      return buildPage(p, `assets/${bookId}/pages/page-${String(i + 1).padStart(3, "0")}.${ext}`);
    }),
  );

  const summaryPages = await Promise.all(
    introPages.map((p, i) => {
      const src = p.redesignedUrl ?? p.imageUrl;
      const ext = src.split(".").pop()?.split("?")[0] || "png";
      return buildPage(p, `assets/${bookId}/summary/summary-${String(i + 1).padStart(3, "0")}.${ext}`);
    }),
  );

  // Cover: move the classified cover page if present; otherwise mirror the
  // first interior page so coverUrl always points at a real, moved image.
  let coverUrl = coloringPages[0]?.url ?? "";
  if (coverPage) {
    const src = coverPage.redesignedUrl ?? coverPage.imageUrl;
    const ext = src.split(".").pop()?.split("?")[0] || "png";
    coverUrl = await deps.copyImage({ sourceUrl: src, destKey: `assets/${bookId}/cover.${ext}` });
  }
  const firstImage = coverUrl;
```

Then in the `db.book.create({ data: { … } })` call, replace `summaryPages: [],` (:153) with:

```ts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      summaryPages: summaryPages as any,
```

(`coverUrl: firstImage` / `thumbnailUrl: firstImage` / `squareThumbnailUrl: firstImage` at :148-150 stay unchanged — `firstImage` is now the classified cover. `specifications.pages` at :159 counts interior pages, which is correct.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/clone-core && yarn vitest run src/steps/create-book.test.ts`
Expected: PASS — the new partition tests plus all pre-existing create-book tests (legacy pages with no `pageType` still land in `coloringPages`, so the older assertions hold).

- [ ] **Step 5: Mirror the partition in the manual admin route (parity)**

The manual route `apps/admin/src/app/api/clone/[jobId]/create-book/route.ts` must classify the same way or worker-made and hand-made books diverge (the file header of `create-book.ts` calls out this parity contract). Replace the `const usablePages = …` / `coloringPages = …` block (:49-79) with a partition that reuses the existing `moveCloneJobImageToBook` helper:

```ts
    const allPages = (row.pages as CloneJobPage[]) || [];
    const kept = allPages.filter((p) => !p.excluded && p.imageUrl);
    const coverPage = kept.find((p) => p.pageType === "cover");
    const introPages = kept.filter((p) => p.pageType === "interiorIntro");
    const interiorPages = kept.filter(
      (p) => p.pageType !== "cover" && p.pageType !== "interiorIntro",
    );

    const buildPage = async (p: CloneJobPage, i: number) => {
      const sourceUrl = useRedesigned
        ? p.reproducedUrl || p.redesignedUrl || p.imageUrl
        : p.imageUrl;
      const url = await moveCloneJobImageToBook({ sourceUrl, bookId, pageIndex: i });
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
                name: c.name, type: c.type, role: c.role, characterPrompt: c.characterPrompt,
              })),
              locations: (p.rawData.locations || []).map((l) => ({
                name: l.name, description: l.description, locationPrompt: l.locationPrompt,
              })),
            }
          : undefined,
      };
    };

    const coloringPages = await Promise.all(interiorPages.map((p, i) => buildPage(p, i)));
    // Offset summary indices so their moved keys never collide with interior keys.
    const summaryPages = await Promise.all(
      introPages.map((p, i) => buildPage(p, 1000 + i)),
    );
    const pages = allPages; // storyOutline below still walks every page
```

Then set `summaryPages` on the created book — replace `summaryPages: [],` (:132) with `summaryPages: summaryPages as any,`. And point the cover at the classified cover page — change `coverSourceUrl` (:99) from `pages[0]?.imageUrl` to `(coverPage ?? interiorPages[0])?.imageUrl || null` so the auto-extracted cover style comes from the real cover.

- [ ] **Step 6: Typecheck the admin app**

Run: `cd apps/admin && yarn tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/clone-core/src/steps/create-book.ts packages/clone-core/src/steps/create-book.test.ts "apps/admin/src/app/api/clone/[jobId]/create-book/route.ts"
git commit -m "feat(clone): create-book partitions cover/intro/interior, drops excluded (D2 T-004/005)"
```

---

## Task 6: Gate review UI — classify tab in the job detail screen

**Files:**
- Create: `packages/coloring/src/data/use-classify-gate.ts`, `packages/coloring/src/data/use-classify-gate.test.ts`
- Create: `packages/coloring/src/screens/jobs/job-classify-tab.tsx`
- Modify: `packages/coloring/src/data/types.ts` (add `pageType`/`excluded` to UI `CloneJobPage`; add status), `packages/coloring/src/data/status.ts` (label), `packages/coloring/src/screens/jobs/job-detail-screen.tsx` (mount tab)

**Interfaces:**
- Consumes: `PATCH /api/clone/[jobId]/classify` (Task 4).
- Produces: `useClassifyGate(jobId)` → `{ save(edits), confirm(edits) }`; a `JobClassifyTab` component.

- [ ] **Step 1: Write the failing hook test**

Create `packages/coloring/src/data/use-classify-gate.test.ts` (mirror `use-approve-book.test.ts` in the same folder for the `httpPost`/`renderHook` harness — copy its mock setup verbatim, only changing the module + assertions):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const patch = vi.fn();
vi.mock("@vx/core-uikit/api", () => ({ httpPatch: (...a: unknown[]) => patch(...a) }));
vi.mock("./config", () => ({ COLORING_API_BASE: "/api", COLORING_WRITE_ENABLED: true }));

import { buildClassifyPayload } from "./use-classify-gate";

describe("buildClassifyPayload", () => {
  beforeEach(() => patch.mockReset());

  it("includes confirm flag and only edited fields", () => {
    const payload = buildClassifyPayload(
      [{ pageNumber: 1, pageType: "cover", excluded: false }],
      true,
    );
    expect(payload).toEqual({
      pages: [{ pageNumber: 1, pageType: "cover", excluded: false }],
      confirm: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/coloring && yarn vitest run src/data/use-classify-gate.test.ts`
Expected: FAIL — module `./use-classify-gate` not found.

- [ ] **Step 3: Write the hook**

Create `packages/coloring/src/data/use-classify-gate.ts` (mirrors `use-job-actions.ts`):

```ts
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPatch } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (bật NEXT_PUBLIC_COLORING_WRITE=1, upstream staging).";

export type PageType = "cover" | "interiorIntro" | "interior";
export type ClassifyEdit = { pageNumber: number; pageType?: PageType; excluded?: boolean };

/** Pure payload builder — unit-tested without a live client. */
export function buildClassifyPayload(edits: ClassifyEdit[], confirm: boolean) {
  return { pages: edits, confirm };
}

/** PATCH /clone/[jobId]/classify — save page classifications, optionally confirm+resume. */
export function useClassifyGate(jobId: string) {
  const qc = useQueryClient();
  const send = async (edits: ClassifyEdit[], confirm: boolean) => {
    if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
    await httpPatch(
      `${COLORING_API_BASE}/clone/${encodeURIComponent(jobId)}/classify`,
      buildClassifyPayload(edits, confirm),
    );
    qc.invalidateQueries({ queryKey: ["coloring", "clone-job", jobId] });
  };
  return {
    save: (edits: ClassifyEdit[]) => send(edits, false),
    confirm: (edits: ClassifyEdit[]) => send(edits, true),
  };
}
```

> If `httpPatch` is not exported from `@vx/core-uikit/api`, use `httpPost` against the same route and change the route in Task 4 to `POST`. Check `packages/core-uikit/src/api` exports first.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/coloring && yarn vitest run src/data/use-classify-gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the UI types + status label**

In `packages/coloring/src/data/types.ts`, add to the `CloneJobPage` type the two optional fields (match names used above):

```ts
  pageType?: "cover" | "interiorIntro" | "interior";
  excluded?: boolean;
```

and add `"awaiting-classify"` to the `CloneJobDetail["status"]` union used by the UI (same place the other statuses are listed).

In `packages/coloring/src/data/status.ts`, add a case to `metaFor` so `"awaiting-classify"` renders a distinct chip (e.g. `{ label: "Chờ phân loại", tone: "warning", dot: true, bucket: "running" }` — match the shape of the neighbouring entries in that file).

- [ ] **Step 6: Write the classify tab**

Create `packages/coloring/src/screens/jobs/job-classify-tab.tsx`. Grid of pages, each with a redesigned thumbnail, a `pageType` dropdown, an Exclude toggle, grouped Cover→Intro→Interior with excluded dimmed; bulk-assign; and a "Xác nhận & tạo book" button that calls `confirm`. Background colors per spec §3.3.

```tsx
"use client";

import { useMemo, useState } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { resolveImg } from "../../data/img";
import { useClassifyGate, type PageType, type ClassifyEdit } from "../../data/use-classify-gate";
import type { CloneJobDetail } from "../../data/types";

const TYPE_BG: Record<PageType, string> = {
  cover: "color-mix(in srgb, indigo 16%, var(--card))",
  interiorIntro: "color-mix(in srgb, gold 20%, var(--card))",
  interior: "var(--card)",
};
const TYPES: PageType[] = ["cover", "interiorIntro", "interior"];
const TYPE_LABEL: Record<PageType, string> = { cover: "Cover", interiorIntro: "Intro", interior: "Interior" };

type Row = { pageNumber: number; url: string; pageType: PageType; excluded: boolean };

export function JobClassifyTab({ job }: { job: CloneJobDetail }) {
  const gate = useClassifyGate(job.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>(() =>
    (job.pages ?? []).map((p) => ({
      pageNumber: p.pageNumber,
      url: p.redesignedUrl || p.imageUrl,
      pageType: (p.pageType as PageType) ?? "interior",
      excluded: p.excluded ?? false,
    })),
  );

  const setRow = (pageNumber: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.pageNumber === pageNumber ? { ...r, ...patch } : r)));

  const edits: ClassifyEdit[] = useMemo(
    () => rows.map((r) => ({ pageNumber: r.pageNumber, pageType: r.pageType, excluded: r.excluded })),
    [rows],
  );
  const coverCount = rows.filter((r) => r.pageType === "cover" && !r.excluded).length;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Thất bại"); } finally { setBusy(false); }
  };

  const ordered = [...rows].sort((a, b) => {
    const rank = (r: Row) => (r.excluded ? 9 : TYPES.indexOf(r.pageType));
    return rank(a) - rank(b) || a.pageNumber - b.pageNumber;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {err && <div style={{ padding: "10px 12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>{err}</div>}
      {coverCount !== 1 && (
        <div style={{ padding: "10px 12px", background: "var(--warning-bg)", color: "var(--warning)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>
          Cảnh báo: đang có {coverCount} trang Cover (nên đúng 1).
        </div>
      )}

      <Card title={`Phân loại ${rows.length} trang trước khi tạo book`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12 }}>
          {ordered.map((r) => (
            <div key={r.pageNumber} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden", background: TYPE_BG[r.pageType], opacity: r.excluded ? 0.5 : 1 }}>
              <div style={{ position: "relative", aspectRatio: "3/4", background: "var(--muted)" }}>
                <img src={resolveImg(r.url)} alt={`p${r.pageNumber}`} style={{ width: "100%", height: "100%", objectFit: "cover", textDecoration: r.excluded ? "line-through" : undefined, filter: r.excluded ? "grayscale(1)" : undefined }} />
                <span style={{ position: "absolute", top: 6, left: 6 }}><Badge tone="carbon">#{r.pageNumber}</Badge></span>
              </div>
              <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                <select
                  value={r.pageType}
                  disabled={r.excluded}
                  onChange={(e) => setRow(r.pageNumber, { pageType: e.target.value as PageType })}
                  style={{ fontSize: 12.5, padding: "4px 6px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--card)" }}
                >
                  {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <input type="checkbox" checked={r.excluded} onChange={(e) => setRow(r.pageNumber, { excluded: e.target.checked })} />
                  Loại khỏi book
                </label>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => gate.save(edits))}>
          {busy ? "Đang lưu…" : "Lưu nháp"}
        </Button>
        <Button size="sm" disabled={busy} onClick={() => run(() => gate.confirm(edits))}>
          {busy ? "Đang xử lý…" : "Xác nhận & tạo book"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Mount the tab in the job detail screen**

In `packages/coloring/src/screens/jobs/job-detail-screen.tsx`:

Import it (after the `JobCompareTab` import at :16):

```tsx
import { JobClassifyTab } from "./job-classify-tab";
```

Widen the tab union type (:110 and the `<Tabs<...>>` generic at :223) to include `"classify"`, and conditionally show the tab only when the job is at the gate. Add to the `items` array (before the `pages` entry) when `job.status === "awaiting-classify"`:

```tsx
      <Tabs<"classify" | "pipeline" | "pages" | "info">
        items={[
          ...(job.status === "awaiting-classify"
            ? [{ key: "classify" as const, label: "Phân loại trang · chờ duyệt" }]
            : []),
          { key: "pages", label: `So sánh & chọn trang · ${job.pages.length}` },
          { key: "pipeline", label: "Pipeline & xác nhận" },
          { key: "info", label: "Thông tin & logs" },
        ]}
        value={tab}
        onChange={setTab}
      />
```

Change the initial tab so operators land on the gate when it's active (:110):

```tsx
  const [tab, setTab] = useState<"classify" | "pipeline" | "pages" | "info">("pages");
```

and after `job` is resolved (just before the `return`), default to classify once:

```tsx
  // (add near the other derived state, after `const isLocal = …`)
  // note: keep simple — operator can switch tabs; no effect needed.
```

Add the render branch (replace the `tab === "pipeline" ? … : tab === "pages" ? …` chain at :233-239):

```tsx
      {tab === "classify" ? (
        <JobClassifyTab job={job} />
      ) : tab === "pipeline" ? (
        <JobPipelineTab job={job} isLocal={isLocal} onViewPages={() => setTab("pages")} />
      ) : tab === "pages" ? (
        <JobCompareTab jobId={job.id} pages={job.pages} bookId={job.resultBookId ?? job.bookId ?? undefined} />
      ) : (
        <InfoTab job={job} />
      )}
```

- [ ] **Step 8: Typecheck + run coloring tests**

Run: `cd packages/coloring && yarn tsc --noEmit && yarn vitest run src/data/use-classify-gate.test.ts`
Expected: clean typecheck; hook test PASS.

- [ ] **Step 9: Manual verification (dev, staging write enabled)**

Start the app + worker, run a clone job, and confirm: the job pauses at status `awaiting-classify`; the "Phân loại trang" tab shows the grid; changing a dropdown to Cover tints it indigo, Intro tints amber, Exclude dims + strikes through; "Xác nhận & tạo book" resumes the worker and the resulting Book has the cover as `coverUrl`, intro pages in `summaryPages`, excluded pages absent. Note the observed result in the commit body (evidence before claiming done — verification-before-completion).

- [ ] **Step 10: Commit**

```bash
git add packages/coloring/src/data/use-classify-gate.ts packages/coloring/src/data/use-classify-gate.test.ts packages/coloring/src/screens/jobs/job-classify-tab.tsx packages/coloring/src/data/types.ts packages/coloring/src/data/status.ts packages/coloring/src/screens/jobs/job-detail-screen.tsx
git commit -m "feat(coloring): D2 classify gate review tab + resume (T-003/004/005)"
```

---

## Self-Review

**Spec coverage (§4 / T-003, T-004, T-005):**
- T-003 "Phân loại Source 3 nhóm" → Task 1 (types + heuristic), Task 2 (auto-classify), Task 6 (operator assigns all 3 incl. interiorIntro). ✅
- T-004 "Bỏ Back Cover qua cờ `excluded`" → `excluded` field (Task 1), UI toggle (Task 6), create-book drop (Task 5). ✅
- T-005 "Fix Source theo type" → create-book partition + manual-route parity (Task 5). ✅
- §4.4 mandatory gate → worker pause (Task 3) + resume route (Task 4) + UI (Task 6). ✅
- §4.3 auto-classify at analyze → Task 2 (in `stepOneShot`, which is the one-shot analyze+reproduce merge). Fallback heuristic present; **interiorIntro auto-detection intentionally deferred to the operator** (documented in Task 1 decision — no reliable signal). This is a scoped deviation from §4.3's "interiorIntro heuristic", surfaced here for reviewer awareness.

**Backward-compat check (Global Constraints):** legacy pages (no `pageType`) flow into `coloringPages` in both create-book paths (Task 5 partition puts undefined→interior); pre-existing create-book tests still pass (Task 5 Step 4). No backfill. ✅

**Placeholder scan:** no TBD/TODO; every code step has full code; test steps have real commands + expected output. ✅

**Type consistency:** `pageType` union `"cover"|"interiorIntro"|"interior"` and `excluded: boolean` are identical across `clone-types.ts`, `create-book.ts`, `one-shot.ts`, coloring `types.ts`, the route, and the hook. `classifyPage` signature matches its call site in Task 2. Gate flag name `classifyConfirmed` is identical in Task 3 (read) and Task 4 (write). Status string `"awaiting-classify"` identical across worker, types, and status label. ✅

**Open risk to verify during execution:** whether `@vx/core-uikit/api` exports `httpPatch` (Task 6 Step 3 note) — if not, fall back to `httpPost` and make Task 4 a `POST`. Confirm before writing the hook.
