# Book Review Status + Coloring-Style Bulk Delete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select bulk delete to `/styles/colorstyles`, and turn `Book.isPublic` into an editorial review flag ("Đã duyệt"/"Nháp") with a default approved-only `/books` filter and an authorized approve action.

**Architecture:** Frontend lives in `@vx/coloring` (`packages/coloring/src`), a Next.js UI layer consumed by `apps/admin`. Data access is React-Query hooks in `packages/coloring/src/data/` calling REST routes in `apps/admin/src/app/api/`. Writes are gated behind `COLORING_WRITE_ENABLED`. Operator auth on API routes uses `getOperatorFromRequest`/`requireOperator` from `apps/admin/src/lib/auth/require-operator`. A one-time backfill runs as a worker script.

**Tech Stack:** TypeScript, React 19, Next.js App Router, TanStack Query, Prisma (Postgres), Vitest + jsdom.

## Global Constraints

- **Write gate:** every mutation hook must early-throw `LOCAL_ONLY` when `COLORING_WRITE_ENABLED` is false, and gate its UI control (disabled + title "Cần bật ghi thật (staging)"). `COLORING_WRITE_ENABLED = process.env.NEXT_PUBLIC_COLORING_WRITE !== "0"`.
- **API base:** client hooks build URLs from `COLORING_API_BASE` (imported from `./config`); do not hardcode `/api`.
- **HTTP helpers:** `httpPost<T>(url, data?)`, `httpDel<T>(url, data?)` from `@vx/core-uikit/api` (auto-attach the operator Bearer token).
- **Query keys:** entity list = `["coloring","entity",kind]`; book detail = `["coloring","book",bookId]`; books list = `["coloring","books"]`.
- **Reuse `isPublic`:** `true` → label **"Đã duyệt"** (tone `success`); `false` → label **"Nháp"** (tone `neutral`). No schema migration.
- **Approve authorization (server-side, sole authority):** allow when `operator.role === "admin"` OR `operator.sub === book.assignedToId`; else `403`. Unauthenticated → `401`. Approving sets only `isPublic: true` — never touch `assignedToId`.
- **Copy:** Vietnamese UI strings exactly as written in each task.
- **Coloring UI uses inline `style={{}}` objects and CSS vars** (`var(--danger)`, `var(--volt-600)`, etc.) — match surrounding code; no CSS modules.

---

## Task 1: `useEntityBulkDelete` hook

**Files:**
- Create: `packages/coloring/src/data/use-entity-bulk-delete.ts`
- Modify: `packages/coloring/src/data/index.ts` (add export)
- Test: `packages/coloring/src/data/use-entity-bulk-delete.test.ts`

**Interfaces:**
- Consumes: `httpDel` from `@vx/core-uikit/api`; `COLORING_API_BASE`, `COLORING_WRITE_ENABLED` from `./config`; `useQueryClient` from `@tanstack/react-query`.
- Produces: `useEntityBulkDelete(kind: string): { enabled: boolean; removeMany: (ids: string[]) => Promise<void> }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/coloring/src/data/use-entity-bulk-delete.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const httpDel = vi.fn();
vi.mock("@vx/core-uikit/api", () => ({ httpDel: (...a: unknown[]) => httpDel(...a) }));

const invalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries }) }));

// Force the write flag ON for the module under test.
vi.mock("./config", () => ({
  COLORING_API_BASE: "/coloring-api",
  COLORING_WRITE_ENABLED: true,
}));

import { useEntityBulkDelete } from "./use-entity-bulk-delete";

describe("useEntityBulkDelete", () => {
  beforeEach(() => { httpDel.mockReset(); httpDel.mockResolvedValue({}); invalidateQueries.mockReset(); });

  it("fires one DELETE per id and invalidates the entity list", async () => {
    const { removeMany, enabled } = useEntityBulkDelete("coloring-styles");
    expect(enabled).toBe(true);
    await removeMany(["a", "b b"]);
    expect(httpDel).toHaveBeenCalledTimes(2);
    expect(httpDel).toHaveBeenCalledWith("/coloring-api/coloring-styles/a");
    expect(httpDel).toHaveBeenCalledWith("/coloring-api/coloring-styles/b%20b"); // id encoded
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["coloring", "entity", "coloring-styles"] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/coloring && yarn vitest run src/data/use-entity-bulk-delete.test.ts`
Expected: FAIL — cannot find module `./use-entity-bulk-delete`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/coloring/src/data/use-entity-bulk-delete.ts
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpDel } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

/** Bulk-delete N entities of `kind` (one DELETE per id, parallel), then refresh the list. */
export function useEntityBulkDelete(kind: string) {
  const qc = useQueryClient();
  return {
    enabled: COLORING_WRITE_ENABLED,
    removeMany: async (ids: string[]) => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
      await Promise.all(
        ids.map((id) => httpDel(`${COLORING_API_BASE}/${kind}/${encodeURIComponent(id)}`)),
      );
      qc.invalidateQueries({ queryKey: ["coloring", "entity", kind] });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/coloring && yarn vitest run src/data/use-entity-bulk-delete.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Add barrel export**

In `packages/coloring/src/data/index.ts`, directly below the existing line
`export { useEntityActions } from "./use-entity-actions";` add:

```ts
export { useEntityBulkDelete } from "./use-entity-bulk-delete";
```

- [ ] **Step 6: Commit**

```bash
git add packages/coloring/src/data/use-entity-bulk-delete.ts packages/coloring/src/data/use-entity-bulk-delete.test.ts packages/coloring/src/data/index.ts
git commit -m "feat(coloring): useEntityBulkDelete hook for bulk entity delete"
```

---

## Task 2: Selectable mode in `EntityListScreen` + enable on colorstyles

**Files:**
- Modify: `packages/coloring/src/screens/hubs/entity-list-screen.tsx`
- Modify: `packages/coloring/src/screens/hubs/entity-lists.tsx:137-139` (`ColorStylesScreen`)

**Interfaces:**
- Consumes: `useEntityBulkDelete(kind)` from Task 1 (via `../../data/use-entity-bulk-delete`).
- Produces: `EntityListScreenProps` gains `selectable?: boolean` and `deleteKind?: string`. When `selectable` is absent, behavior is unchanged.

This task is presentational; it is verified manually (the repo has no React Testing Library harness for coloring UI — existing coloring tests cover data hooks only).

- [ ] **Step 1: Add the new props to the interface**

In `entity-list-screen.tsx`, add two fields to `EntityListScreenProps` (after `largeImage?: boolean;`):

```ts
  /** Enables multi-select + a bulk-delete action bar. Off by default (cards just open detail). */
  selectable?: boolean;
  /** API kind used for DELETE when selectable (defaults to `kind`). */
  deleteKind?: string;
```

- [ ] **Step 2: Add imports**

At the top of `entity-list-screen.tsx`, add these imports alongside the existing ones:

```ts
import { Button } from "../../components/ui/button";
import { useEntityBulkDelete } from "../../data/use-entity-bulk-delete";
```

(`useState` and `Card`, `Icon`, `Badge`, `Input` are already imported.)

- [ ] **Step 3: Add selection state + handlers inside the component**

In `entity-list-screen.tsx`, update the destructured props and add state. Change the signature line to include the new props:

```tsx
export function EntityListScreen({ title, subtitle, path, kind, toCard, action, emptyText, largeImage, selectable, deleteKind }: EntityListScreenProps) {
```

Then, immediately after the existing `const [q, setQ] = useState("");` line, add:

```tsx
  const bulk = useEntityBulkDelete(deleteKind ?? kind);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toggle = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearSel = () => { setSelected(new Set()); setErr(null); };
  const removeSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Xoá ${selected.size} mục đã chọn? Hành động này không thể hoàn tác.`)) return;
    setBusy(true); setErr(null);
    try { await bulk.removeMany([...selected]); clearSel(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Xoá thất bại"); }
    finally { setBusy(false); }
  };
```

- [ ] **Step 4: Render the bulk action bar**

In `entity-list-screen.tsx`, directly after the header `</div>` that closes the title/search row (the block ending right before the `{isLoading ? (` ternary), insert:

```tsx
      {selectable && selected.size > 0 && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Đã chọn {selected.size} mục</span>
            <div style={{ flex: 1 }} />
            <Button size="sm" disabled={busy || !bulk.enabled}
              title={bulk.enabled ? undefined : "Cần bật ghi thật (staging)"}
              style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
              onClick={removeSelected}>
              <Icon name="trash-2" size={16} /> {busy ? "Đang xoá…" : "Xoá đã chọn"}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={clearSel}>Bỏ chọn</Button>
          </div>
          {err && <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--danger)" }}>{err}</div>}
        </Card>
      )}
```

- [ ] **Step 5: Add a checkbox to each card + selection outline**

In `entity-list-screen.tsx`, find the card wrapper `<div key={c.id} className="mo-bookcard" onClick={...}>`. Replace that opening tag with a version that adds relative positioning + a selected outline, and insert a checkbox as the first child:

```tsx
            <div key={c.id} className="mo-bookcard"
              onClick={() => router.push(`${B}/entity/${kind}/${c.id}`)}
              style={{ position: "relative", ...(selectable && selected.has(c.id) ? { outline: "2px solid var(--volt-600)", outlineOffset: 2 } : {}) }}>
              {selectable && (
                <label onClick={(e) => e.stopPropagation()} title="Chọn để xoá"
                  style={{ position: "absolute", top: 8, left: 8, zIndex: 2, width: 26, height: 26, borderRadius: 7, background: "rgba(255,255,255,.92)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} style={{ cursor: "pointer", width: 15, height: 15 }} />
                </label>
              )}
```

Leave the rest of the card body (the `largeImage ? (...)` block and below) exactly as-is — you only replaced the opening `<div>` tag and added the `{selectable && (...)}` checkbox block right after it.

- [ ] **Step 6: Enable selection on `ColorStylesScreen`**

In `entity-lists.tsx`, update `ColorStylesScreen` (line ~137) to pass `selectable`:

```tsx
export const ColorStylesScreen = () => (
  <EntityListScreen title="Coloring style" subtitle="bảng màu & chất liệu" path="coloring-styles" kind="coloring-styles" toCard={colorStyleCard} largeImage selectable emptyText="Chưa có coloring style nào." action={<ExtractLink href="/styles/extractcolor" label="Tạo từ ảnh" />} />
);
```

- [ ] **Step 7: Typecheck + build the coloring package**

Run: `cd packages/coloring && yarn tsc --noEmit`
Expected: no type errors.

- [ ] **Step 8: Manual verification**

Run the admin app (`yarn dev --filter=@vx/admin`), open `/coloring/styles/colorstyles`. Verify:
- Each style card shows a checkbox top-left; clicking it selects (blue outline) WITHOUT opening the detail page.
- Clicking the card body (not the checkbox) still opens the style detail.
- With ≥1 selected, the "Đã chọn N mục · Xoá đã chọn · Bỏ chọn" bar appears.
- Other hubs (e.g. `/coloring/library/brands`, `/coloring/styles/bwstyles`) show NO checkboxes.

- [ ] **Step 9: Commit**

```bash
git add packages/coloring/src/screens/hubs/entity-list-screen.tsx packages/coloring/src/screens/hubs/entity-lists.tsx
git commit -m "feat(coloring): multi-select bulk delete on coloring styles hub"
```

---

## Task 3: One-time backfill — mark all existing books approved

**Files:**
- Create: `apps/worker/src/scripts/backfill-book-approved.ts`
- Modify: `apps/worker/package.json` (add a `scripts` entry)

**Interfaces:**
- Consumes: `db` (PrismaClient) from `../db` (same import the sibling scripts use).
- Produces: a runnable one-off script; no code depends on it.

This is a data migration; verify by dry-run + row count. No unit test.

- [ ] **Step 1: Confirm the db import path used by sibling scripts**

Run: `cd apps/worker && head -20 src/scripts/backfill-book-niche.ts`
Expected: shows `import { db } from "../db";` (or equivalent). Use whatever the siblings use.

- [ ] **Step 2: Write the script**

```ts
// apps/worker/src/scripts/backfill-book-approved.ts
/**
 * One-time backfill: mark every EXISTING book as approved (isPublic = true).
 *
 * Rationale: isPublic is being repurposed as the editorial review flag
 * ("Đã duyệt" = true / "Nháp" = false). Books that already exist predate the
 * workflow and are considered reviewed, so they become approved. Books created
 * afterward by the clone pipeline keep isPublic=false → they show as "Nháp"
 * until a reviewer approves them.
 *
 * Usage:
 *   yarn backfill:book-approved            # set isPublic=true on all books
 *   yarn backfill:book-approved --dry-run  # only report how many would change
 */
import { db } from "../db";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pending = await db.book.count({ where: { isPublic: false } });
  console.log(`[backfill-book-approved] ${pending} book(s) currently isPublic=false`);
  if (dryRun) {
    console.log("[backfill-book-approved] --dry-run: no changes made.");
    return;
  }
  const res = await db.book.updateMany({ where: { isPublic: false }, data: { isPublic: true } });
  console.log(`[backfill-book-approved] updated ${res.count} book(s) → isPublic=true`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Add the yarn script**

In `apps/worker/package.json`, inside `"scripts"`, add — matching the exact runner form used by the sibling `backfill:niche`/`cleanup` entries (`node --env-file=.env --import tsx …`):

```json
"backfill:book-approved": "node --env-file=.env --import tsx src/scripts/backfill-book-approved.ts"
```

- [ ] **Step 4: Verify script compiles / dry-run locally**

Run (against a dev DB): `cd apps/worker && yarn backfill:book-approved --dry-run`
Expected: prints the count of `isPublic=false` books and "no changes made."

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/scripts/backfill-book-approved.ts apps/worker/package.json
git commit -m "chore(worker): one-time backfill to mark existing books approved"
```

> **Deploy note (not a code step):** run `yarn backfill:book-approved` once against the target DB when this change ships. Do this AFTER the API/UI relabel is deployed so behavior is consistent.

---

## Task 4: Approve API route (`POST /api/books/[bookId]/approve`)

**Files:**
- Create: `apps/admin/src/app/api/books/[bookId]/approve/route.ts`
- Test: `apps/admin/src/app/api/books/[bookId]/approve/route.test.ts`

**Interfaces:**
- Consumes: `getOperatorFromRequest` from `@/lib/auth/require-operator` (returns `{ sub: string; role: string; ... } | null`); `prisma` from `@vx/db`.
- Produces: `POST(req, { params: Promise<{ bookId: string }> })` → `200 { success: true, book }` on approve; `401` unauth; `403` not admin & not assignee; `404` book missing.

- [ ] **Step 1: Write the failing test**

```ts
// apps/admin/src/app/api/books/[bookId]/approve/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@vx/db", () => ({ prisma: { book: {
  findUnique: (...a: unknown[]) => findUnique(...a),
  update: (...a: unknown[]) => update(...a),
} } }));

const getOperatorFromRequest = vi.fn();
vi.mock("@/lib/auth/require-operator", () => ({
  getOperatorFromRequest: (...a: unknown[]) => getOperatorFromRequest(...a),
}));

import { POST } from "./route";

function post(bookId: string) {
  return POST(
    new NextRequest(`http://localhost/api/books/${bookId}/approve`, { method: "POST" }),
    { params: Promise.resolve({ bookId }) },
  );
}

describe("POST /api/books/[bookId]/approve", () => {
  beforeEach(() => {
    findUnique.mockReset(); update.mockReset();
    getOperatorFromRequest.mockReset();
    update.mockResolvedValue({ id: "b1", isPublic: true, assignedToId: "op-1" });
  });

  it("401 when unauthenticated", async () => {
    getOperatorFromRequest.mockResolvedValue(null);
    const res = await post("b1");
    expect(res.status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it("404 when the book does not exist", async () => {
    getOperatorFromRequest.mockResolvedValue({ sub: "op-1", role: "member" });
    findUnique.mockResolvedValue(null);
    const res = await post("missing");
    expect(res.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it("403 when a non-admin operator is not the assignee", async () => {
    getOperatorFromRequest.mockResolvedValue({ sub: "op-2", role: "member" });
    findUnique.mockResolvedValue({ id: "b1", assignedToId: "op-1", isPublic: false });
    const res = await post("b1");
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("approves when the caller is the assignee (isPublic=true, assignment untouched)", async () => {
    getOperatorFromRequest.mockResolvedValue({ sub: "op-1", role: "member" });
    findUnique.mockResolvedValue({ id: "b1", assignedToId: "op-1", isPublic: false });
    const res = await post("b1");
    expect(res.status).toBe(200);
    const arg = update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "b1" });
    expect(arg.data).toEqual({ isPublic: true }); // assignedToId NOT present
  });

  it("approves when the caller is an admin (even if not the assignee)", async () => {
    getOperatorFromRequest.mockResolvedValue({ sub: "admin-9", role: "admin" });
    findUnique.mockResolvedValue({ id: "b1", assignedToId: "op-1", isPublic: false });
    const res = await post("b1");
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && yarn vitest run "src/app/api/books/[bookId]/approve/route.test.ts"`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 3: Write the route**

```ts
// apps/admin/src/app/api/books/[bookId]/approve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { getOperatorFromRequest } from "@/lib/auth/require-operator";

export const dynamic = "force-dynamic";

/**
 * Approve a book: sets isPublic=true ("Đã duyệt"). Authorization is the sole
 * responsibility of this route (the client cannot check assignee locally):
 * allowed for admins, or the operator the book is assigned to. Assignment is
 * left untouched.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const operator = await getOperatorFromRequest(_req);
  if (!operator) return NextResponse.json({ error: "auth required" }, { status: 401 });

  const book = await prisma.book.findUnique({ where: { id: bookId }, select: { id: true, assignedToId: true } });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = operator.role === "admin" || operator.sub === book.assignedToId;
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const updated = await prisma.book.update({ where: { id: bookId }, data: { isPublic: true } });
  return NextResponse.json({ success: true, book: updated });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/admin && yarn vitest run "src/app/api/books/[bookId]/approve/route.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/src/app/api/books/[bookId]/approve/route.ts" "apps/admin/src/app/api/books/[bookId]/approve/route.test.ts"
git commit -m "feat(api): authorized book approve endpoint (isPublic=true)"
```

---

## Task 5: `useApproveBook` hook

**Files:**
- Modify: `packages/coloring/src/data/use-book-actions.ts` (add hook)
- Modify: `packages/coloring/src/data/index.ts` (extend the `use-book-actions` export)
- Test: `packages/coloring/src/data/use-approve-book.test.ts`

**Interfaces:**
- Consumes: `httpPost` from `@vx/core-uikit/api`; `COLORING_API_BASE`, `COLORING_WRITE_ENABLED` from `./config`; `useQueryClient`.
- Produces: `useApproveBook(bookId: string): () => Promise<void>` (POSTs to `/books/{id}/approve`, invalidates book + books list).

- [ ] **Step 1: Write the failing test**

```ts
// packages/coloring/src/data/use-approve-book.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const httpPost = vi.fn();
vi.mock("@vx/core-uikit/api", () => ({
  httpPost: (...a: unknown[]) => httpPost(...a),
  httpDel: vi.fn(),
}));

const invalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries }) }));

vi.mock("./config", () => ({ COLORING_API_BASE: "/coloring-api", COLORING_WRITE_ENABLED: true }));

import { useApproveBook } from "./use-book-actions";

describe("useApproveBook", () => {
  beforeEach(() => { httpPost.mockReset(); httpPost.mockResolvedValue({ success: true }); invalidateQueries.mockReset(); });

  it("POSTs to the approve endpoint and invalidates book + list", async () => {
    const approve = useApproveBook("b1");
    await approve();
    expect(httpPost).toHaveBeenCalledWith("/coloring-api/books/b1/approve", {});
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["coloring", "book", "b1"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["coloring", "books"] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/coloring && yarn vitest run src/data/use-approve-book.test.ts`
Expected: FAIL — `useApproveBook` is not exported.

- [ ] **Step 3: Add the hook**

In `packages/coloring/src/data/use-book-actions.ts`, add at the end of the file (the top imports already include `httpPost`, `useQueryClient`, `COLORING_API_BASE`, `COLORING_WRITE_ENABLED`, and `LOCAL_ONLY`):

```ts
/** POST /books/[id]/approve → marks the book approved (isPublic=true). Server enforces who may approve. */
export function useApproveBook(bookId: string): () => Promise<void> {
  const qc = useQueryClient();
  return async () => {
    if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
    const res = await httpPost<{ success?: boolean; error?: string }>(
      `${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}/approve`,
      {},
    );
    if (res?.error) throw new Error(res.error);
    qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
    qc.invalidateQueries({ queryKey: ["coloring", "books"] });
  };
}
```

> Note: the test calls `httpPost` with `"/coloring-api/books/b1/approve"` — `encodeURIComponent("b1")` is `"b1"`, so the expectation matches.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/coloring && yarn vitest run src/data/use-approve-book.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Extend the barrel export**

In `packages/coloring/src/data/index.ts`, change the existing line
`export { useGeneratePdf, useGenerateSubtitle } from "./use-book-actions";` to also export the new hook (and the already-present `useReclone`/`useDeleteBook` if not exported — add only what's missing; at minimum add `useApproveBook`):

```ts
export { useGeneratePdf, useGenerateSubtitle, useReclone, useDeleteBook, useApproveBook } from "./use-book-actions";
```

- [ ] **Step 6: Commit**

```bash
git add packages/coloring/src/data/use-book-actions.ts packages/coloring/src/data/use-approve-book.test.ts packages/coloring/src/data/index.ts
git commit -m "feat(coloring): useApproveBook hook"
```

---

## Task 6: Book detail — approve button + badge relabel

**Files:**
- Modify: `packages/coloring/src/screens/books/book-detail-screen.tsx`
- Modify: `packages/coloring/src/screens/books/book-info-tab.tsx:57`

**Interfaces:**
- Consumes: `useApproveBook` from `../../data/use-book-actions` (Task 5); `useColoringAuth` from `../../hooks/coloring-auth`.

Presentational + wiring; verified manually.

- [ ] **Step 1: Relabel the detail header badge**

In `book-detail-screen.tsx` (line ~259), change:

```tsx
          {b.isPublic ? <Badge tone="success" dot>Đang bán</Badge> : <Badge tone="neutral">Nháp</Badge>}
```

to:

```tsx
          {b.isPublic ? <Badge tone="success" dot>Đã duyệt</Badge> : <Badge tone="neutral">Nháp</Badge>}
```

- [ ] **Step 2: Relabel the info-tab status badge**

In `book-info-tab.tsx` (line ~57), change:

```tsx
            {b.isPublic ? <Badge tone="success" dot>Đang bán</Badge> : <Badge tone="neutral">Nháp</Badge>}
```

to:

```tsx
            {b.isPublic ? <Badge tone="success" dot>Đã duyệt</Badge> : <Badge tone="neutral">Nháp</Badge>}
```

- [ ] **Step 3: Import the approve hook + auth in the detail screen**

In `book-detail-screen.tsx`, add `useApproveBook` to the existing import from `../../data/use-book-actions`:

```tsx
import { useGeneratePdf, useGenerateSubtitle, useReclone, useDeleteBook, useApproveBook } from "../../data/use-book-actions";
```

and add (new import line):

```tsx
import { useColoringAuth } from "../../hooks/coloring-auth";
```

- [ ] **Step 4: Wire the hook inside the component**

In `book-detail-screen.tsx`, next to the other action-hook calls (e.g. after `const deleteBook = useDeleteBook(bookId);`), add:

```tsx
  const approveBook = useApproveBook(bookId);
  const { user } = useColoringAuth();
```

- [ ] **Step 5: Render the approve button**

In `book-detail-screen.tsx`, inside the header action `<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>` (the same row holding "Sửa thông tin"/"Export ZIP"/"Xoá sách"), add as the FIRST child of that div:

```tsx
          {!b.isPublic && (
            <Button size="sm" disabled={!COLORING_WRITE_ENABLED || busy}
              title={COLORING_WRITE_ENABLED ? "Duyệt sách này (chuyển sang Đã duyệt)" : "Cần bật ghi thật (staging)"}
              onClick={async () => {
                if (!window.confirm("Duyệt sách này? Sách sẽ chuyển sang trạng thái Đã duyệt.")) return;
                setBusy(true); setMsg(null);
                try { await approveBook(); setMsg({ ok: "Đã duyệt sách" }); }
                catch (e) { setMsg({ err: e instanceof Error ? e.message : "Duyệt thất bại" }); }
                finally { setBusy(false); }
              }}>
              <Icon name="check" size={16} /> Duyệt sách
            </Button>
          )}
```

> `user` is imported for parity with the auth model but the button is shown to any operator when the book is draft; the server returns 403 if the caller may not approve, and the error surfaces via `setMsg`. (If `check` is not a valid icon name in `../../lib/icon`, use `"circle-check"` — grep `packages/coloring/src/lib/icon` for the available set first.)

- [ ] **Step 6: Confirm the icon name exists**

Run: `cd packages/coloring && grep -oE '"(check|circle-check|badge-check)"' src/lib/icon.* | sort -u`
Expected: pick whichever exists; update the `<Icon name=... />` in Step 5 if `check` is absent.

- [ ] **Step 7: Typecheck**

Run: `cd packages/coloring && yarn tsc --noEmit`
Expected: no type errors.

- [ ] **Step 8: Manual verification**

In the running admin app: open a "Nháp" book detail → header shows a green "Duyệt sách" button and a neutral "Nháp" badge. Click it → confirm dialog → on success the badge flips to "Đã duyệt" and the button disappears. An already-approved book shows no approve button.

- [ ] **Step 9: Commit**

```bash
git add packages/coloring/src/screens/books/book-detail-screen.tsx packages/coloring/src/screens/books/book-info-tab.tsx
git commit -m "feat(coloring): approve action + Đã duyệt/Nháp relabel on book detail"
```

---

## Task 7: Books list — default approved filter, options relabel, card badge

**Files:**
- Modify: `packages/coloring/src/screens/books/books-screen.tsx`

**Interfaces:**
- Consumes: nothing new (uses existing `useQueryParam`, `useBooks`). API route needs no change (already maps `pub→isPublic:true`, `draft→isPublic:false`).

Presentational + default state; verified manually.

- [ ] **Step 1: Default the status filter to approved**

In `books-screen.tsx` (line ~63), change:

```tsx
  const [status] = useQueryParam("status", "all");
```

to:

```tsx
  const [status] = useQueryParam("status", "pub");
```

- [ ] **Step 2: Keep "Tất cả" able to override the default**

In `books-screen.tsx`, the setter (line ~69) currently is:

```tsx
  const setStatus = (v: string) => setParams({ status: v === "all" ? null : v, page: null });
```

Because the default is now `"pub"`, selecting "Tất cả" must write an explicit `all` (not null, which would fall back to `pub`). Change it to:

```tsx
  const setStatus = (v: string) => setParams({ status: v, page: null });
```

- [ ] **Step 3: Relabel the filter Select options**

In `books-screen.tsx` (line ~132), change the status `Select` options to:

```tsx
          <div style={{ width: 150 }}><Select value={status} onChange={setStatus} options={[{ label: "Tất cả", value: "all" }, { label: "Đã duyệt", value: "pub" }, { label: "Nháp", value: "draft" }]} /></div>
```

- [ ] **Step 4: Relabel the card badge**

In `books-screen.tsx` `BookCard` (line ~48), change:

```tsx
        {book.isPublic ? <Badge tone="success" dot>Đang bán</Badge> : <Badge tone="neutral">Nháp</Badge>}
```

to:

```tsx
        {book.isPublic ? <Badge tone="success" dot>Đã duyệt</Badge> : <Badge tone="neutral">Nháp</Badge>}
```

- [ ] **Step 5: Fix the empty-state "no match" condition**

In `books-screen.tsx` (line ~165), the branch distinguishing "no match" from "empty library" checks `status !== "all"`. With the new default that logic still holds (any non-"all" status is an active filter), but make the intent explicit by treating the default-approved view as a filtered view. Change:

```tsx
        q || cat || status !== "all" || assignFilter !== "all" ? (
```

Leave as-is — `status` defaulting to `"pub"` already satisfies `status !== "all"`, so a fresh page with zero approved books correctly shows the "Không khớp" copy. No change needed; this step is a verification checkpoint only.

Verify by reading the line: confirm it reads `status !== "all"`.

- [ ] **Step 6: Typecheck**

Run: `cd packages/coloring && yarn tsc --noEmit`
Expected: no type errors.

- [ ] **Step 7: Manual verification**

In the running admin app, open `/coloring/books`:
- Default view shows only "Đã duyệt" books (freshly generated draft books are hidden).
- The status dropdown default is "Đã duyệt"; switching to "Nháp" reveals draft books; "Tất cả" shows both.
- Reloading the page with a chosen filter preserves it (URL `?status=`).
- Card badges read "Đã duyệt" / "Nháp".

- [ ] **Step 8: Run the full coloring + admin test suites**

Run: `cd packages/coloring && yarn vitest run` then `cd apps/admin && yarn vitest run`
Expected: all pass (including the new Task 1/4/5 tests).

- [ ] **Step 9: Commit**

```bash
git add packages/coloring/src/screens/books/books-screen.tsx
git commit -m "feat(coloring): default books list to approved + Đã duyệt/Nháp filter labels"
```

---

## Self-Review Notes

- **Spec coverage:** F1 bulk delete = Tasks 1–2; F1 data-safety (no safeguard) = honored (plain confirm, no usage count). F2 reuse isPublic + relabel = Tasks 6–7; backfill = Task 3; default filter = Task 7; approve action detail-only = Task 6; server authorization + assignment untouched = Task 4. All spec sections map to a task.
- **Type consistency:** `useEntityBulkDelete(kind)` → `{ enabled, removeMany }` used identically in Task 2. `useApproveBook(bookId)` → `() => Promise<void>` used in Task 6. Approve route contract (`sub`/`role`, `assignedToId`, `isPublic`) matches `SessionClaims` and the Prisma `Book` model.
- **Placeholders:** none — every code step shows full code; the only conditional is the icon-name check (Step 6, Task 6) which has an explicit fallback.
