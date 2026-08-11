# D4c — Push to Cover (`coverCandidates[]`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After colorizing an interior page, "Push to Cover" appends the page's colored image as a non-destructive `coverCandidate` and auto-selects it as the live cover (`coverUrl`), preserving the previous cover and every other candidate; the operator can switch, delete, and open any candidate in the Cover editor.

**Architecture:** Pure helpers in `cover-candidates.ts` (unit-tested) seed/add/select/delete candidates on an abstract `{coverUrl, coverCandidates, selectedCoverCandidateId}` state. Atomic book-level routes read the book, run the helpers, and write back the `coverUrl` column + `book.data` JSON in one `prisma.book.update`. Push reuses the page's existing `coloredUrl` (no AI, no R2). UI: the per-page "Làm bìa" button is replaced by "Push to Cover"; a "Cover candidates" strip in Book detail manages selection/deletion + Cover-editor entry.

**Tech Stack:** TypeScript, React (`@vx/coloring`), Prisma (`@vx/db`), Next.js API routes, Vitest. No new dependencies.

## Global Constraints

- **Non-destructive / add-only:** Push appends an `origin:"pushed"` candidate and auto-selects it. The pre-existing cover is preserved as an `origin:"source"` candidate on the first push. Interior pages are never modified.
- **Lazy seed:** `book.data.coverCandidates` stays `undefined` until the first push; then it is seeded to `[{origin:"source", url: book.coverUrl, ...}]` (only if `coverUrl` exists) before the pushed candidate is appended.
- **Mirror invariant (soft):** `coverUrl` (column) mirrors the selected candidate's `url` on push/select. Selection is authoritative via `book.data.selectedCoverCandidateId` (an id — never match by URL, `?v=` cache-bust suffixes differ). The Cover editor may later replace `coverUrl` with a text-composed image; that is expected and does not touch `selectedCoverCandidateId`.
- **Push source:** the candidate `url` is the page's existing `coloredUrl` (already in R2). No image generation, no upload.
- **Dedupe by url:** adding a candidate whose `url` already exists is a no-op on the list; the caller then selects that existing candidate.
- **Delete guard:** `deleteCandidate` refuses the currently-selected candidate (throws → 400). A non-selected `origin:"source"` candidate may be deleted.
- **Addressing:** find the book by `id`; find candidates by `candidate.id` (never by array index). Write back the full arrays via `prisma.book.update`.
- **Write flag:** all mutations behind `COLORING_WRITE_ENABLED`; hooks invalidate `["coloring","book",bookId]`.
- **Typecheck gate:** `@vx/coloring` has no typecheck script → `cd apps/admin && yarn typecheck` (baseline may show `.next/dev/types/routes.d.ts` noise; judge by delta). Coloring tests: `cd packages/coloring && yarn vitest run <file>`.

---

## File Structure

**Create:**
- `packages/coloring/src/data/cover-candidates.ts` — `CoverState` + pure helpers (re-exports `CoverCandidate`).
- `packages/coloring/src/data/cover-candidates.test.ts` — helper unit tests.
- `packages/coloring/src/data/use-cover-candidates.ts` — client hook.
- `packages/coloring/src/screens/books/cover-candidates-strip.tsx` — Book-detail candidate grid component.
- `apps/admin/src/app/api/books/[bookId]/cover-candidates/route.ts` — POST (push) + PATCH (select).
- `apps/admin/src/app/api/books/[bookId]/cover-candidates/[candidateId]/route.ts` — DELETE.

**Modify:**
- `packages/coloring/src/data/types.ts` — `CoverCandidate` interface.
- `packages/coloring/package.json` — `./data/cover-candidates` subpath export.
- `packages/coloring/src/screens/books/page-actions-row.tsx` — replace "Làm bìa" with "Push to Cover".
- `packages/coloring/src/screens/books/book-detail-screen.tsx` — render `<CoverCandidatesStrip>` in the Cover card.

---

## Task 1: Type — `CoverCandidate`

**Files:**
- Modify: `packages/coloring/src/data/types.ts`

**Interfaces:**
- Produces: `interface CoverCandidate { id: string; url: string; origin: "source" | "pushed"; fromPageId?: string; createdAt: string }`.

- [ ] **Step 1: Add the interface**

In `packages/coloring/src/data/types.ts`, add near the other book types (e.g. directly above or below `PageVariant`):
```ts
/** D4c: a non-destructive cover candidate. Lives in book.data.coverCandidates[];
 *  book.data.selectedCoverCandidateId points at the live one and book.coverUrl mirrors its url. */
export interface CoverCandidate {
  id: string;
  url: string;
  origin: "source" | "pushed";
  fromPageId?: string;
  createdAt: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/admin && yarn typecheck`
Expected: no new errors vs baseline.

- [ ] **Step 3: Commit**

```bash
git add packages/coloring/src/data/types.ts
git commit -m "feat(coloring): CoverCandidate type (D4c T-015)"
```

---

## Task 2: Pure candidate helpers

**Files:**
- Create: `packages/coloring/src/data/cover-candidates.ts`
- Test: `packages/coloring/src/data/cover-candidates.test.ts`

**Interfaces:**
- Consumes: `CoverCandidate` from `./types` (Task 1).
- Produces:
  - `interface CoverState { coverUrl?: string; coverCandidates?: CoverCandidate[]; selectedCoverCandidateId?: string }`
  - `ensureSourceCandidate(state: CoverState, newId: () => string, now: string): { state: CoverState; sourceId?: string }`
  - `addCandidate(state: CoverState, incoming: CoverCandidate): CoverState`
  - `selectCandidate(state: CoverState, candidateId: string): CoverState`
  - `deleteCandidate(state: CoverState, candidateId: string): CoverState`

- [ ] **Step 1: Write the failing test**

Create `packages/coloring/src/data/cover-candidates.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ensureSourceCandidate, addCandidate, selectCandidate, deleteCandidate, type CoverState } from "./cover-candidates";
import type { CoverCandidate } from "./types";

const pushed = (id: string, url = `/c/${id}.png`): CoverCandidate => ({ id, url, origin: "pushed", fromPageId: "p1", createdAt: "t" });

describe("ensureSourceCandidate", () => {
  it("seeds an origin:source candidate from coverUrl and selects it when the list is empty", () => {
    const { state, sourceId } = ensureSourceCandidate({ coverUrl: "/old-cover.png" }, () => "src", "t0");
    expect(state.coverCandidates).toEqual([
      { id: "src", url: "/old-cover.png", origin: "source", createdAt: "t0" },
    ]);
    expect(state.selectedCoverCandidateId).toBe("src");
    expect(sourceId).toBe("src");
  });

  it("does not seed (sourceId undefined) when there is no coverUrl", () => {
    const { state, sourceId } = ensureSourceCandidate({}, () => "src", "t0");
    expect(state.coverCandidates).toBeUndefined();
    expect(sourceId).toBeUndefined();
  });

  it("is a no-op when a candidate already exists (returns the first candidate's id)", () => {
    const existing: CoverState = {
      coverUrl: "/old-cover.png",
      coverCandidates: [{ id: "s1", url: "/old-cover.png", origin: "source", createdAt: "t" }, pushed("p2")],
      selectedCoverCandidateId: "s1",
    };
    const { state, sourceId } = ensureSourceCandidate(existing, () => "NEW", "t9");
    expect(sourceId).toBe("s1");
    expect(state.coverCandidates).toHaveLength(2);
  });
});

describe("addCandidate", () => {
  it("appends a new candidate without changing the selection", () => {
    const state: CoverState = {
      coverUrl: "/old.png",
      coverCandidates: [{ id: "s1", url: "/old.png", origin: "source", createdAt: "t" }],
      selectedCoverCandidateId: "s1",
    };
    const out = addCandidate(state, pushed("p1"));
    expect(out.coverCandidates!.map((c) => c.id)).toEqual(["s1", "p1"]);
    expect(out.selectedCoverCandidateId).toBe("s1");
  });

  it("dedupes by url (no duplicate appended)", () => {
    const state: CoverState = {
      coverCandidates: [{ id: "s1", url: "/dup.png", origin: "source", createdAt: "t" }],
      selectedCoverCandidateId: "s1",
    };
    const out = addCandidate(state, pushed("p1", "/dup.png"));
    expect(out.coverCandidates!.map((c) => c.id)).toEqual(["s1"]);
  });
});

describe("selectCandidate", () => {
  it("sets selectedCoverCandidateId and mirrors coverUrl", () => {
    const state: CoverState = {
      coverUrl: "/old.png",
      coverCandidates: [
        { id: "s1", url: "/old.png", origin: "source", createdAt: "t" },
        pushed("p1", "/c/p1.png"),
      ],
      selectedCoverCandidateId: "s1",
    };
    const out = selectCandidate(state, "p1");
    expect(out.selectedCoverCandidateId).toBe("p1");
    expect(out.coverUrl).toBe("/c/p1.png");
  });

  it("throws on an unknown id", () => {
    const state: CoverState = { coverCandidates: [pushed("p1")], selectedCoverCandidateId: "p1" };
    expect(() => selectCandidate(state, "nope")).toThrow();
  });
});

describe("deleteCandidate", () => {
  const base = (): CoverState => ({
    coverUrl: "/old.png",
    coverCandidates: [
      { id: "s1", url: "/old.png", origin: "source", createdAt: "t" },
      pushed("p1"),
      pushed("p2"),
    ],
    selectedCoverCandidateId: "p1",
  });

  it("removes a non-selected candidate", () => {
    const out = deleteCandidate(base(), "p2");
    expect(out.coverCandidates!.map((c) => c.id)).toEqual(["s1", "p1"]);
  });
  it("removes a non-selected source candidate", () => {
    const out = deleteCandidate(base(), "s1");
    expect(out.coverCandidates!.map((c) => c.id)).toEqual(["p1", "p2"]);
  });
  it("refuses to delete the selected candidate", () => {
    expect(() => deleteCandidate(base(), "p1")).toThrow();
  });
  it("throws on an unknown id", () => {
    expect(() => deleteCandidate(base(), "nope")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/coloring && yarn vitest run src/data/cover-candidates.test.ts`
Expected: FAIL — module `./cover-candidates` not found.

- [ ] **Step 3: Write the helpers**

Create `packages/coloring/src/data/cover-candidates.ts`:
```ts
import type { CoverCandidate } from "./types";
// Re-export so server routes import the type + helpers from this one pure module
// (packages/coloring/src/data/types.ts is pure interfaces — safe on the server).
export type { CoverCandidate };

export interface CoverState {
  coverUrl?: string;
  coverCandidates?: CoverCandidate[];
  selectedCoverCandidateId?: string;
}

/** Seed the current cover (book.coverUrl) as an origin:"source" candidate if the
 *  list is empty and a coverUrl exists, selecting it. Returns the (possibly
 *  unchanged) state and the source/first candidate id (undefined if nothing to seed). */
export function ensureSourceCandidate(
  state: CoverState,
  newId: () => string,
  now: string,
): { state: CoverState; sourceId?: string } {
  const list = state.coverCandidates ?? [];
  if (list.length > 0) return { state, sourceId: list[0].id };
  if (!state.coverUrl) return { state, sourceId: undefined };
  const id = newId();
  const source: CoverCandidate = { id, url: state.coverUrl, origin: "source", createdAt: now };
  return {
    state: { ...state, coverCandidates: [source], selectedCoverCandidateId: id },
    sourceId: id,
  };
}

/** Append a candidate without changing the selection. Dedupes by url: if a
 *  candidate with the same url exists, the state is returned unchanged. */
export function addCandidate(state: CoverState, incoming: CoverCandidate): CoverState {
  const list = state.coverCandidates ?? [];
  if (list.some((c) => c.url === incoming.url)) return { ...state, coverCandidates: list };
  return { ...state, coverCandidates: [...list, incoming] };
}

/** Point selectedCoverCandidateId at `candidateId` and mirror its url onto coverUrl. */
export function selectCandidate(state: CoverState, candidateId: string): CoverState {
  const c = (state.coverCandidates ?? []).find((x) => x.id === candidateId);
  if (!c) throw new Error(`cover candidate ${candidateId} not found`);
  return { ...state, selectedCoverCandidateId: candidateId, coverUrl: c.url };
}

/** Remove a candidate. Refuses the currently-selected one. */
export function deleteCandidate(state: CoverState, candidateId: string): CoverState {
  if (candidateId === state.selectedCoverCandidateId) throw new Error("cannot delete the selected cover candidate");
  const list = state.coverCandidates ?? [];
  if (!list.some((c) => c.id === candidateId)) throw new Error(`cover candidate ${candidateId} not found`);
  return { ...state, coverCandidates: list.filter((c) => c.id !== candidateId) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/coloring && yarn vitest run src/data/cover-candidates.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add packages/coloring/src/data/cover-candidates.ts packages/coloring/src/data/cover-candidates.test.ts
git commit -m "feat(coloring): pure cover-candidate helpers (seed/add/select/delete) (D4c T-015/016)"
```

---

## Task 3: Cover-candidate routes + subpath export

**Files:**
- Modify: `packages/coloring/package.json`
- Create: `apps/admin/src/app/api/books/[bookId]/cover-candidates/route.ts`
- Create: `apps/admin/src/app/api/books/[bookId]/cover-candidates/[candidateId]/route.ts`

**Interfaces:**
- Consumes: `ensureSourceCandidate`/`addCandidate`/`selectCandidate`/`deleteCandidate` + `type CoverCandidate`, imported from `@vx/coloring/data/cover-candidates` (NEW subpath export, Step 1). `@vx/coloring` is already a workspace dep of `apps/admin`; `cover-candidates.ts` is pure (no `"use client"`, only pure-interface imports) → server-safe.
- Produces: `POST/PATCH /api/books/[bookId]/cover-candidates`, `DELETE /api/books/[bookId]/cover-candidates/[candidateId]`.

- [ ] **Step 1: Add the `./data/cover-candidates` subpath export**

In `packages/coloring/package.json`, add to the `exports` map next to the existing `./data/page-variants` line:
```json
    "./screens": "./src/screens/index.ts",
    "./data/page-variants": "./src/data/page-variants.ts",
    "./data/cover-candidates": "./src/data/cover-candidates.ts",
    "./styles.css": "./src/styles/motio.css"
```

- [ ] **Step 2: Write the POST + PATCH route**

Create `apps/admin/src/app/api/books/[bookId]/cover-candidates/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@vx/db";
import {
  ensureSourceCandidate, addCandidate, selectCandidate,
  type CoverCandidate,
} from "@vx/coloring/data/cover-candidates";

type RouteParams = { params: Promise<{ bookId: string }> };

/** Read the book's cover state from the coverUrl column + book.data JSON. */
function readState(book: { coverUrl: string | null; data: unknown }) {
  const data = (book.data as Record<string, unknown> | null) ?? {};
  return {
    curData: data,
    state: {
      coverUrl: book.coverUrl ?? undefined,
      coverCandidates: data.coverCandidates as CoverCandidate[] | undefined,
      selectedCoverCandidateId: data.selectedCoverCandidateId as string | undefined,
    },
  };
}

/** Persist the cover state back onto the coverUrl column + book.data JSON. */
async function writeState(bookId: string, curData: Record<string, unknown>, state: {
  coverUrl?: string; coverCandidates?: CoverCandidate[]; selectedCoverCandidateId?: string;
}) {
  await prisma.book.update({
    where: { id: bookId },
    data: {
      coverUrl: state.coverUrl ?? null,
      data: { ...curData, coverCandidates: state.coverCandidates, selectedCoverCandidateId: state.selectedCoverCandidateId } as any,
    },
  });
}

/** Push to Cover: add the page's colored image as a candidate and auto-select it. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId } = await params;
    const body = (await req.json().catch(() => ({}))) as { url?: string; fromPageId?: string };
    if (!body.url) return NextResponse.json({ error: "url required" }, { status: 400 });

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const { curData, state: state0 } = readState(book);

    const now = new Date().toISOString();
    const seeded = ensureSourceCandidate(state0, () => crypto.randomUUID(), now);
    let state = seeded.state;

    const pushed: CoverCandidate = {
      id: crypto.randomUUID(), url: body.url, origin: "pushed",
      ...(body.fromPageId ? { fromPageId: body.fromPageId } : {}),
      createdAt: new Date().toISOString(),
    };
    state = addCandidate(state, pushed); // dedupes by url
    const target = (state.coverCandidates ?? []).find((c) => c.url === body.url)!;
    state = selectCandidate(state, target.id);

    await writeState(bookId, curData, state);
    return NextResponse.json({ success: true, selectedCoverCandidateId: state.selectedCoverCandidateId });
  } catch (error) {
    console.error("[books/cover-candidates POST] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

/** Select a candidate as the live cover (mirrors coverUrl). */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId } = await params;
    const body = (await req.json().catch(() => ({}))) as { candidateId?: string };
    if (!body.candidateId) return NextResponse.json({ error: "candidateId required" }, { status: 400 });

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const { curData, state } = readState(book);

    const next = selectCandidate(state, body.candidateId);
    await writeState(bookId, curData, next);
    return NextResponse.json({ success: true, selectedCoverCandidateId: body.candidateId });
  } catch (error) {
    console.error("[books/cover-candidates PATCH] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
```

- [ ] **Step 3: Write the DELETE route**

Create `apps/admin/src/app/api/books/[bookId]/cover-candidates/[candidateId]/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { deleteCandidate, type CoverCandidate } from "@vx/coloring/data/cover-candidates";

type RouteParams = { params: Promise<{ bookId: string; candidateId: string }> };

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId, candidateId } = await params;
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const data = (book.data as Record<string, unknown> | null) ?? {};
    const state = {
      coverUrl: book.coverUrl ?? undefined,
      coverCandidates: data.coverCandidates as CoverCandidate[] | undefined,
      selectedCoverCandidateId: data.selectedCoverCandidateId as string | undefined,
    };

    const next = deleteCandidate(state, candidateId); // throws on selected/unknown
    await prisma.book.update({
      where: { id: bookId },
      data: {
        coverUrl: next.coverUrl ?? null,
        data: { ...data, coverCandidates: next.coverCandidates, selectedCoverCandidateId: next.selectedCoverCandidateId } as any,
      },
    });
    return NextResponse.json({ success: true, removed: candidateId });
  } catch (error) {
    console.error("[books/cover-candidates DELETE] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/admin && yarn typecheck`
Expected: no new errors vs baseline (confirms the `@vx/coloring/data/cover-candidates` import resolves and route types are sound).

- [ ] **Step 5: Reasoning check (no route test harness)**

Write into the commit body: POST seeds the source candidate from `coverUrl` (only when none exist), appends the pushed candidate (deduped by url), then selects it → mirrors `coverUrl`. PATCH selects by id. DELETE refuses selected/unknown (helper throws → 400). Interior pages are never read/written. All state is keyed by candidate `id`.

- [ ] **Step 6: Commit**

```bash
git add packages/coloring/package.json "apps/admin/src/app/api/books/[bookId]/cover-candidates"
git commit -m "feat(api): book cover-candidate routes (push/select/delete) (D4c T-015/016/017)"
```

---

## Task 4: `use-cover-candidates` hook

**Files:**
- Create: `packages/coloring/src/data/use-cover-candidates.ts`

**Interfaces:**
- Consumes: the routes from Task 3.
- Produces: `useCoverCandidates(bookId) → { enabled, push(pageId, coloredUrl), select(candidateId), remove(candidateId) }`.

- [ ] **Step 1: Write the hook**

Create `packages/coloring/src/data/use-cover-candidates.ts`:
```ts
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost, httpPatch, httpDel } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

/** D4c: non-destructive cover-candidate actions (push / select / delete). */
export function useCoverCandidates(bookId: string) {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
  const base = `${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}/cover-candidates`;
  const guard = () => { if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY); };

  return {
    enabled: COLORING_WRITE_ENABLED,
    /** Push a page's colored image to Cover: adds a candidate and auto-selects it. */
    push: async (pageId: string, coloredUrl: string) => {
      guard();
      await httpPost(base, { url: coloredUrl, fromPageId: pageId });
      inval();
    },
    select: async (candidateId: string) => {
      guard();
      await httpPatch(base, { candidateId });
      inval();
    },
    remove: async (candidateId: string) => {
      guard();
      await httpDel(`${base}/${encodeURIComponent(candidateId)}`);
      inval();
    },
  };
}
```
(`httpPost`/`httpPatch`/`httpDel` are all exported from `@vx/core-uikit/api` — same set used by `use-page-variants.ts`.)

- [ ] **Step 2: Typecheck**

Run: `cd apps/admin && yarn typecheck`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add packages/coloring/src/data/use-cover-candidates.ts
git commit -m "feat(coloring): use-cover-candidates hook (D4c)"
```

---

## Task 5: Replace "Làm bìa" with "Push to Cover" (preview modal)

**Files:**
- Modify: `packages/coloring/src/screens/books/page-actions-row.tsx`

**Interfaces:**
- Consumes: `useCoverCandidates` (Task 4).
- Produces: no exports (UI).

- [ ] **Step 1: Import the hook + instantiate it**

In `page-actions-row.tsx`, add the import after the `usePageVariants` import (line ~8):
```ts
import { useCoverCandidates } from "../../data/use-cover-candidates";
```
Inside `PageActionsRow`, after `const variants = usePageVariants(bookId);` (line ~35):
```ts
  const coverCandidates = useCoverCandidates(bookId);
```

- [ ] **Step 2: Replace the "Làm bìa" button**

In the `{colored && (…)}` block, replace the existing "Làm bìa" button:
```tsx
            <Button variant="outline" size="sm" disabled={disabled || busy !== null} title="Đặt bản màu làm ảnh bìa (coverUrl)" onClick={run("cover", () => actions.setCover(colored))}>
              <Icon name="image" size={15} /> {busy === "cover" ? "Đang đặt…" : "Làm bìa"}
            </Button>
```
with:
```tsx
            <Button variant="outline" size="sm" disabled={disabled || busy !== null} title="Đẩy bản màu này thành ứng viên bìa và chọn làm bìa chính (giữ bìa cũ)" onClick={run("cover", () => coverCandidates.push(page.id, colored!))}>
              <Icon name="image" size={15} /> {busy === "cover" ? "Đang đẩy…" : "Push to Cover"}
            </Button>
```
(`actions.setCover` stays defined in `use-page-actions.ts` — just no longer called here. "Set thumbnail" / "Set vuông" are unchanged.)

- [ ] **Step 3: Typecheck + coloring tests**

Run: `cd apps/admin && yarn typecheck` (expect no new errors)
Run: `cd packages/coloring && yarn test` (expect the full suite green)

- [ ] **Step 4: Commit**

```bash
git add packages/coloring/src/screens/books/page-actions-row.tsx
git commit -m "feat(coloring): Push to Cover replaces Làm bìa in page preview (D4c T-015)"
```

---

## Task 6: Cover candidates strip (Book detail)

**Files:**
- Create: `packages/coloring/src/screens/books/cover-candidates-strip.tsx`
- Modify: `packages/coloring/src/screens/books/book-detail-screen.tsx`

**Interfaces:**
- Consumes: `useCoverCandidates` (Task 4); `useSaveCover` from `../../data/use-cover-actions`; `CoverCandidate` from `../../data/types`; `resolveImg` from `../../data/img`; `COLORING_BASE` from `../../components/shell/nav-config`.
- Produces: `export function CoverCandidatesStrip({ bookId, candidates, selectedId, coverMeta })`.

- [ ] **Step 1: Write the strip component**

Create `packages/coloring/src/screens/books/cover-candidates-strip.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useCoverCandidates } from "../../data/use-cover-candidates";
import { useSaveCover } from "../../data/use-cover-actions";
import { resolveImg } from "../../data/img";
import type { CoverCandidate } from "../../data/types";

/** D4c: manage a book's cover candidates — select (mirror coverUrl), delete
 *  (non-selected), and open any candidate as the Cover editor background. */
export function CoverCandidatesStrip({
  bookId, candidates, selectedId, coverMeta,
}: {
  bookId: string;
  candidates: CoverCandidate[];
  selectedId?: string;
  coverMeta: Record<string, unknown>;
}) {
  const router = useRouter();
  const cc = useCoverCandidates(bookId);
  const saveCover = useSaveCover(bookId);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const disabled = !cc.enabled;

  const run = (kind: string, fn: () => Promise<void>) => async () => {
    setBusy(kind); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Thất bại"); } finally { setBusy(null); }
  };

  const openInEditor = (c: CoverCandidate) => run(`edit-${c.id}`, async () => {
    await saveCover.saveCoverSource(c.url, coverMeta);
    router.push(`${B}/books/${bookId}/cover`);
  });

  if (candidates.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".04em" }}>Cover candidates · {candidates.length}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 10 }}>
        {candidates.map((c) => {
          const isSel = c.id === selectedId;
          const label = c.origin === "source" ? "Nguồn" : "Push";
          return (
            <div key={c.id} style={{ position: "relative" }}>
              <div onClick={disabled || isSel ? undefined : run(`sel-${c.id}`, () => cc.select(c.id))}
                style={{ aspectRatio: "1 / 1", borderRadius: "var(--radius-sm)", overflow: "hidden", border: `${isSel ? 2 : 1}px solid ${isSel ? "var(--volt-600)" : "var(--border)"}`, boxShadow: isSel ? "var(--shadow-glow)" : undefined, background: "#fff", cursor: disabled || isSel ? "default" : "pointer" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolveImg(c.url)} alt={label} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <span style={{ position: "absolute", left: 4, bottom: 4, fontSize: 9, fontWeight: 700, color: "#fff", background: "rgba(11,13,12,.6)", padding: "0 4px", borderRadius: 4 }}>{label}</span>
              {isSel && <span style={{ position: "absolute", right: 4, top: 4, background: "var(--volt-500)", color: "var(--carbon-950)", borderRadius: 99, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={10} /></span>}
              {!isSel && (
                <button type="button" title="Xoá ứng viên" disabled={disabled || busy !== null}
                  onClick={run(`del-${c.id}`, () => cc.remove(c.id))}
                  style={{ position: "absolute", right: 4, top: 4, background: "rgba(11,13,12,.6)", color: "#fff", border: "none", borderRadius: 99, width: 16, height: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="x" size={10} />
                </button>
              )}
              <button type="button" title="Mở trong Cover editor" disabled={disabled || busy !== null}
                onClick={openInEditor(c)}
                style={{ marginTop: 4, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 10.5, padding: "3px 4px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--card)", cursor: disabled ? "default" : "pointer" }}>
                <Icon name="image" size={11} /> {busy === `edit-${c.id}` ? "Đang mở…" : "Cover editor"}
              </button>
            </div>
          );
        })}
      </div>
      {err && <div style={{ padding: "6px 8px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12 }}>{err}</div>}
      {disabled && <div style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>Chọn/xoá ứng viên bìa chỉ chạy khi bật ghi thật (staging).</div>}
    </div>
  );
}
```

- [ ] **Step 2: Render the strip in book-detail's Cover card**

In `packages/coloring/src/screens/books/book-detail-screen.tsx`, add the import next to the other screen imports (near line 19, `import { PageActionsRow } from "./page-actions-row";`):
```ts
import { CoverCandidatesStrip } from "./cover-candidates-strip";
import type { CoverCandidate } from "../../data/types";
```
Then inside the `<Card title="Cover & hình màu">` block, immediately after the closing `</div>` of the thumbnails grid (the grid that ends at line ~440, right before `</Card>`), add:
```tsx
                <CoverCandidatesStrip
                  bookId={bookId}
                  candidates={(b.data?.coverCandidates ?? []) as CoverCandidate[]}
                  selectedId={typeof b.data?.selectedCoverCandidateId === "string" ? b.data.selectedCoverCandidateId : undefined}
                  coverMeta={coverMetaObj}
                />
```

- [ ] **Step 3: Typecheck + coloring tests**

Run: `cd apps/admin && yarn typecheck` (expect no new errors)
Run: `cd packages/coloring && yarn test` (expect green)

- [ ] **Step 4: Manual verification (dev, staging write enabled)**

Open a book with a colored interior → preview a page → "Push to Cover": a candidate is added, auto-selected, `coverUrl` updates, and the previous cover shows as a `Nguồn` (source) candidate. In Book detail → "Cover & hình màu" → the "Cover candidates" strip lists them: clicking a non-selected candidate swaps the live cover; the selected candidate shows a check and cannot be deleted; deleting a non-selected candidate works; "Cover editor" opens the editor with that candidate as the background.

- [ ] **Step 5: Commit**

```bash
git add packages/coloring/src/screens/books/cover-candidates-strip.tsx packages/coloring/src/screens/books/book-detail-screen.tsx
git commit -m "feat(coloring): Cover candidates strip in book detail (D4c T-016/017)"
```

---

## Self-Review

**Spec coverage (`2026-08-11-d4c-push-to-cover-design.md`):**
- §3 data model (`CoverCandidate` + `coverCandidates`/`selectedCoverCandidateId`) → Task 1 + Task 3 write-back. ✅
- §4 pure helpers (ensureSource/add/select/delete) → Task 2. ✅
- §5 routes (POST/PATCH/DELETE) + subpath export → Task 3. ✅
- §6 hook (`useCoverCandidates`) → Task 4. ✅
- §7.1 replace "Làm bìa" → "Push to Cover" → Task 5. ✅
- §7.2 Cover candidates strip in Book detail + Cover-editor entry → Task 6. ✅
- Decision "replace Làm bìa" → Task 5. ✅
- Decision "grid in Book detail" → Task 6. ✅
- Decision "Cover-editor entry in scope" → Task 6 Step 1 (`openInEditor` via `saveCoverSource` + router). ✅
- Decision "push reuses coloredUrl, no AI/R2" → Task 3 POST (pure DB) + Task 4 hook (`push(pageId, coloredUrl)`). ✅
- Decision "selection by id" → `selectedCoverCandidateId` in Task 1/2/3, read by id in Task 6. ✅
- §8 tests → Task 2 (`cover-candidates.test.ts` with seed/add-dedupe/select-mirror/delete-guard). ✅
- T-017 (interior untouched on push) → Task 3 POST reads `body.url` only, never mutates pages. ✅

**Placeholder scan:** every code step has full code; the test step has real cases + expected output; the route reasoning check is explicit. Helper import path pinned (`@vx/coloring/data/cover-candidates` via the Task 3 Step 1 subpath export). No TODO/TBD. ✅

**Type consistency:** `CoverCandidate` shape identical in Task 1 (types.ts), Task 2 (helpers), Task 3 (routes), Task 6 (strip). `CoverState` + helper signatures (`ensureSourceCandidate(state,newId,now)→{state,sourceId}`, `addCandidate`, `selectCandidate`, `deleteCandidate`) identical in Task 2 (def) and Task 3 (use). Hook method names (`push`/`select`/`remove`) identical in Task 4 (def) and Tasks 5/6 (use). Route paths `/books/[bookId]/cover-candidates[/[candidateId]]` identical in Task 3 (routes) and Task 4 (hook URLs). `origin: "source" | "pushed"` consistent everywhere. ✅
