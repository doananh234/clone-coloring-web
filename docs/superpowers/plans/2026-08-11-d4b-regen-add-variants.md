# D4b — Regen Thêm (variants[]) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A book interior page can accumulate non-destructive regenerated variants (`variants[]`), from source A (redesign template) or B (redesign + the page's original prompt); the operator picks the live one; the base image is never overwritten.

**Architecture:** A book-level route generates variants by calling `editImage` directly (so a caller-supplied prompt for source B is honored — `generatePage`/`buildRedesignPrompt` are left untouched). Pure helpers in `page-variants.ts` do the seed/add/select/delete on the page object (unit-tested); the routes are thin I/O wrappers. UI lives in the per-page preview modal and the batch "Chọn hình" tab. No `cloneJobId` needed.

**Tech Stack:** TypeScript, React (coloring package), Prisma (`@vx/db`), Next.js API routes, `@vx/server-core/ai` (editImage) + `/r2`, Vitest.

## Global Constraints

- **Non-destructive / add-only:** Regen Thêm appends `origin:"regen"` variants to `page.variants[]` and does NOT change `selectedVariantId`. The base image is preserved as the `origin:"original"` variant.
- **Lazy seed:** `page.variants` stays `undefined` until the first Regen Thêm; then it is seeded to `[{origin:"original", url: page.url, coloredUrl: page.coloredUrl, ...}]` before regens are appended. `selectedVariantId` points at the original after seeding.
- **Mirror invariant:** when `variants` exists, `selectedVariantId` always points to a variant, and `page.url`/`page.coloredUrl` equal that variant's `url`/`coloredUrl`.
- **Source A/B:** A → `editImage(anchorUrl, buildRedesignPrompt(changePercent))`. B → `editImage(anchorUrl, buildRedesignPrompt(changePercent) + "\n\nORIGINAL SCENE DESCRIPTION (keep faithful to this):\n" + page.prompt)`. If B is requested but `page.prompt` is empty, fall back to A.
- **Anchor:** regen anchors on the `origin:"original"` variant's `url` (the page's base line-art), resolved via `resolveR2Url`. Book-level, no `cloneJobId`.
- **Addressing:** find the page by `coloringPage.id === pageId` (never by array index). Write back the full `coloringPages` array via `prisma.book.update`.
- **Clamps:** `count` ∈ [1,4]; `changePercent` ∈ [5,95] (default 30).
- **Delete guard:** `deleteVariant` refuses the currently-selected variant and any `origin:"original"` variant.
- **Variant shape:** `{ id, url, coloredUrl?, origin: "original"|"regen", source?: "A"|"B", prompt?, changePercent?, createdAt }`. No `parentVariantId`/`backgroundColor`.
- **Colorize touch:** the colorize route additionally syncs the produced `coloredUrl` into the page's selected variant (keeps color when switching variants). This is the only change to colorize.
- **Keep old batch:** the "Regen hàng loạt (ghi đè)" batch stays; add a second "Regen Thêm (Add)" batch alongside it.
- **Write flag:** all mutations behind `COLORING_WRITE_ENABLED`; hooks invalidate `["coloring","book",bookId]`.
- **Typecheck gate:** `@vx/coloring` has no typecheck script → `cd apps/admin && yarn typecheck` (baseline may show `.next/dev/types/routes.d.ts` noise; judge by delta). Coloring tests: `cd packages/coloring && yarn vitest run <file>`.

---

## File Structure

**Create:**
- `packages/coloring/src/data/page-variants.ts` — `PageVariant`/`VariantPage` types (VariantPage local) + pure helpers.
- `packages/coloring/src/data/page-variants.test.ts` — helper unit tests.
- `packages/coloring/src/data/use-page-variants.ts` — client hook.
- `apps/admin/src/app/api/books/[bookId]/pages/[pageId]/variants/route.ts` — POST (regen add) + PATCH (select).
- `apps/admin/src/app/api/books/[bookId]/pages/[pageId]/variants/[variantId]/route.ts` — DELETE.

**Modify:**
- `packages/coloring/src/data/types.ts` — `PageVariant` interface + `variants?`/`selectedVariantId?` on `BookColoringPage`.
- `apps/admin/src/app/api/coloring-styles/colorize/route.ts` — sync coloredUrl into selected variant.
- `packages/coloring/src/screens/books/page-actions-row.tsx` — Regen Thêm ×N + variant grid.
- `packages/coloring/src/screens/books/page-batch-select.tsx` — batch Regen Thêm (Add) alongside overwrite batch; render grid without cloneJobId.

---

## Task 1: Types — PageVariant + page fields

**Files:**
- Modify: `packages/coloring/src/data/types.ts` (`BookColoringPage` ~140-151)

**Interfaces:**
- Produces: `interface PageVariant { id: string; url: string; coloredUrl?: string; origin: "original" | "regen"; source?: "A" | "B"; prompt?: string; changePercent?: number; createdAt: string }`; `BookColoringPage` gains `variants?: PageVariant[]` and `selectedVariantId?: string`.

- [ ] **Step 1: Add the type + fields**

In `packages/coloring/src/data/types.ts`, add a `PageVariant` interface directly above `BookColoringPage`:
```ts
/** D4b: a non-destructive regenerated version of an interior page. */
export interface PageVariant {
  id: string;
  url: string;
  coloredUrl?: string;
  origin: "original" | "regen";
  source?: "A" | "B";
  prompt?: string;
  changePercent?: number;
  createdAt: string;
}
```
Then inside `interface BookColoringPage`, after the D4a fields (`parentPageNumber?: number;`):
```ts
  parentPageNumber?: number;
  /** D4b: non-destructive regen variants; selectedVariantId is the live pointer
   *  and url/coloredUrl mirror the selected variant. undefined = never regenerated. */
  variants?: PageVariant[];
  selectedVariantId?: string;
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/admin && yarn typecheck`
Expected: no new errors vs baseline.

- [ ] **Step 3: Commit**

```bash
git add packages/coloring/src/data/types.ts
git commit -m "feat(coloring): PageVariant type + variants/selectedVariantId on BookColoringPage (D4b T-014)"
```

---

## Task 2: Pure variant helpers

**Files:**
- Create: `packages/coloring/src/data/page-variants.ts`
- Test: `packages/coloring/src/data/page-variants.test.ts`

**Interfaces:**
- Consumes: `PageVariant` from `./types` (Task 1).
- Produces:
  - `interface VariantPage { url: string; coloredUrl?: string; prompt?: string; variants?: PageVariant[]; selectedVariantId?: string }`
  - `ensureOriginalVariant(page: VariantPage, newId: () => string, now: string): { page: VariantPage; originalId: string }`
  - `addVariants(page: VariantPage, incoming: PageVariant[]): VariantPage`
  - `selectVariant(page: VariantPage, variantId: string): VariantPage`
  - `deleteVariant(page: VariantPage, variantId: string): VariantPage`

- [ ] **Step 1: Write the failing test**

Create `packages/coloring/src/data/page-variants.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ensureOriginalVariant, addVariants, selectVariant, deleteVariant, type VariantPage } from "./page-variants";
import type { PageVariant } from "./types";

const regen = (id: string): PageVariant => ({ id, url: `/r/${id}.png`, origin: "regen", source: "A", createdAt: "t" });

describe("ensureOriginalVariant", () => {
  it("seeds the original from url/coloredUrl when variants is empty and selects it", () => {
    const { page, originalId } = ensureOriginalVariant(
      { url: "/base.png", coloredUrl: "/base-c.png" }, () => "orig", "t0",
    );
    expect(page.variants).toEqual([
      { id: "orig", url: "/base.png", coloredUrl: "/base-c.png", origin: "original", createdAt: "t0" },
    ]);
    expect(page.selectedVariantId).toBe("orig");
    expect(originalId).toBe("orig");
  });

  it("is a no-op when an original already exists (returns its id)", () => {
    const existing: VariantPage = {
      url: "/base.png",
      variants: [{ id: "o1", url: "/base.png", origin: "original", createdAt: "t" }, regen("r1")],
      selectedVariantId: "o1",
    };
    const { page, originalId } = ensureOriginalVariant(existing, () => "NEW", "t9");
    expect(originalId).toBe("o1");
    expect(page.variants).toHaveLength(2);
  });
});

describe("addVariants", () => {
  it("appends without changing the selection", () => {
    const page: VariantPage = {
      url: "/base.png",
      variants: [{ id: "o1", url: "/base.png", origin: "original", createdAt: "t" }],
      selectedVariantId: "o1",
    };
    const out = addVariants(page, [regen("r1"), regen("r2")]);
    expect(out.variants!.map((v) => v.id)).toEqual(["o1", "r1", "r2"]);
    expect(out.selectedVariantId).toBe("o1");
  });
});

describe("selectVariant", () => {
  it("mirrors the chosen variant's url + coloredUrl onto the page", () => {
    const page: VariantPage = {
      url: "/base.png",
      coloredUrl: "/base-c.png",
      variants: [
        { id: "o1", url: "/base.png", coloredUrl: "/base-c.png", origin: "original", createdAt: "t" },
        { id: "r1", url: "/r/r1.png", origin: "regen", source: "A", createdAt: "t" },
      ],
      selectedVariantId: "o1",
    };
    const out = selectVariant(page, "r1");
    expect(out.selectedVariantId).toBe("r1");
    expect(out.url).toBe("/r/r1.png");
    expect(out.coloredUrl).toBeUndefined(); // r1 has no coloredUrl → page clears it
  });

  it("throws when the variant id is unknown", () => {
    const page: VariantPage = { url: "/base.png", variants: [regen("r1")], selectedVariantId: "r1" };
    expect(() => selectVariant(page, "nope")).toThrow();
  });
});

describe("deleteVariant", () => {
  const base = (): VariantPage => ({
    url: "/base.png",
    variants: [
      { id: "o1", url: "/base.png", origin: "original", createdAt: "t" },
      regen("r1"),
      regen("r2"),
    ],
    selectedVariantId: "o1",
  });

  it("removes a non-selected regen variant", () => {
    const out = deleteVariant(base(), "r2");
    expect(out.variants!.map((v) => v.id)).toEqual(["o1", "r1"]);
  });
  it("refuses to delete the selected variant", () => {
    const p = base(); p.selectedVariantId = "r1";
    expect(() => deleteVariant(p, "r1")).toThrow();
  });
  it("refuses to delete the original", () => {
    expect(() => deleteVariant(base(), "o1")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/coloring && yarn vitest run src/data/page-variants.test.ts`
Expected: FAIL — module `./page-variants` not found.

- [ ] **Step 3: Write the helpers**

Create `packages/coloring/src/data/page-variants.ts`:
```ts
import type { PageVariant } from "./types";
// Re-export so server routes can import the type + helpers from this one pure module
// (packages/coloring/src/data/types.ts is pure interfaces — safe on the server).
export type { PageVariant };

export interface VariantPage {
  url: string;
  coloredUrl?: string;
  prompt?: string;
  variants?: PageVariant[];
  selectedVariantId?: string;
}

/** Seed the current base image as an origin:"original" variant if none exists yet,
 *  selecting it. Returns the (possibly unchanged) page and the original variant id. */
export function ensureOriginalVariant(
  page: VariantPage,
  newId: () => string,
  now: string,
): { page: VariantPage; originalId: string } {
  const existing = (page.variants ?? []).find((v) => v.origin === "original");
  if (existing) return { page, originalId: existing.id };
  const id = newId();
  const original: PageVariant = {
    id,
    url: page.url,
    ...(page.coloredUrl ? { coloredUrl: page.coloredUrl } : {}),
    origin: "original",
    createdAt: now,
  };
  return {
    page: { ...page, variants: [original], selectedVariantId: id },
    originalId: id,
  };
}

/** Append variants without changing the current selection (add-only). */
export function addVariants(page: VariantPage, incoming: PageVariant[]): VariantPage {
  return { ...page, variants: [...(page.variants ?? []), ...incoming] };
}

/** Point selectedVariantId at `variantId` and mirror its url/coloredUrl onto the page. */
export function selectVariant(page: VariantPage, variantId: string): VariantPage {
  const v = (page.variants ?? []).find((x) => x.id === variantId);
  if (!v) throw new Error(`variant ${variantId} not found`);
  return { ...page, selectedVariantId: variantId, url: v.url, coloredUrl: v.coloredUrl };
}

/** Remove a variant. Refuses the selected variant and any origin:"original". */
export function deleteVariant(page: VariantPage, variantId: string): VariantPage {
  if (variantId === page.selectedVariantId) throw new Error("cannot delete the selected variant");
  const v = (page.variants ?? []).find((x) => x.id === variantId);
  if (v?.origin === "original") throw new Error("cannot delete the original variant");
  return { ...page, variants: (page.variants ?? []).filter((x) => x.id !== variantId) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/coloring && yarn vitest run src/data/page-variants.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add packages/coloring/src/data/page-variants.ts packages/coloring/src/data/page-variants.test.ts
git commit -m "feat(coloring): pure page-variant helpers (seed/add/select/delete) (D4b T-014)"
```

---

## Task 3: Variant API routes + colorize sync

**Files:**
- Create: `apps/admin/src/app/api/books/[bookId]/pages/[pageId]/variants/route.ts`
- Create: `apps/admin/src/app/api/books/[bookId]/pages/[pageId]/variants/[variantId]/route.ts`
- Modify: `apps/admin/src/app/api/coloring-styles/colorize/route.ts:129-135`

**Interfaces:**
- Consumes: `ensureOriginalVariant`/`addVariants`/`selectVariant`/`deleteVariant` + `type PageVariant`, imported from `@vx/coloring/data/page-variants` (a NEW subpath export added in Step 1). `@vx/coloring` is already a workspace dep of `apps/admin` (admin imports `@vx/coloring/screens`), and `page-variants.ts` is pure (no `"use client"`, only pure-interface imports), so it is safe to import into a server route.
- Produces: `POST/PATCH /api/books/[bookId]/pages/[pageId]/variants`, `DELETE /api/books/[bookId]/pages/[pageId]/variants/[variantId]`.

- [ ] **Step 1: Add the `./data/page-variants` subpath export**

In `packages/coloring/package.json`, add to the `exports` map (which currently exposes only `.`, `./components`, `./screens`, `./styles.css`):
```json
    "./screens": "./src/screens/index.ts",
    "./data/page-variants": "./src/data/page-variants.ts",
    "./styles.css": "./src/styles/motio.css"
```
This lets the admin route import the pure helpers + `PageVariant` type from `@vx/coloring/data/page-variants` without pulling in any client component. (The helper file re-exports `PageVariant` from `./types`, per Task 2.)

- [ ] **Step 2: Write the POST + PATCH route**

Create `apps/admin/src/app/api/books/[bookId]/pages/[pageId]/variants/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@vx/db";
import { editImage } from "@vx/server-core/ai";
import { buildRedesignPrompt } from "@vx/server-core/ai/prompts";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import { flushLangfuse } from "@vx/server-core/langfuse";
import { ensureOriginalVariant, addVariants, selectVariant, type PageVariant } from "@vx/coloring/data/page-variants";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ bookId: string; pageId: string }> };

/** Regen Thêm: generate `count` non-destructive variants for one page. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId, pageId } = await params;
    const body = (await req.json().catch(() => ({}))) as { count?: number; source?: "A" | "B"; changePercent?: number };
    const count = Math.min(4, Math.max(1, body.count ?? 1));
    const source: "A" | "B" = body.source === "B" ? "B" : "A";
    const pct = Math.min(95, Math.max(5, body.changePercent ?? 30));

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const pages = (book.coloringPages as any[]) || [];
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    const now = new Date().toISOString();
    const seeded = ensureOriginalVariant(pages[idx], () => crypto.randomUUID(), now);
    let page = seeded.page;
    const anchor = (page.variants ?? []).find((v: PageVariant) => v.id === seeded.originalId)!;
    const anchorUrl = resolveR2Url(anchor.url);

    const originalPrompt = typeof page.prompt === "string" ? page.prompt.trim() : "";
    const useB = source === "B" && originalPrompt.length > 0;
    const prompt = useB
      ? `${buildRedesignPrompt(pct)}\n\nORIGINAL SCENE DESCRIPTION (keep faithful to this):\n${originalPrompt}`
      : buildRedesignPrompt(pct);

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const created: PageVariant[] = [];
    for (let k = 0; k < count; k++) {
      const img = await editImage(anchorUrl, prompt, {
        trace: { caller: "books/page-variants", entityType: "book", entityId: bookId },
      });
      const base64 = img.base64 || img.dataUrl?.split(",")[1] || "";
      const variantId = crypto.randomUUID();
      const key = `assets/${bookId}/pages/${pageId}-v-${variantId}.png`;
      const { url } = await uploadToR2({ client: r2Client, config: r2Config, key, body: Buffer.from(base64, "base64"), contentType: "image/png" });
      created.push({
        id: variantId, url, origin: "regen",
        source: useB ? "B" : "A",
        ...(useB ? { prompt: originalPrompt } : {}),
        changePercent: pct, createdAt: new Date().toISOString(),
      });
    }

    page = addVariants(page, created);
    pages[idx] = page;
    await prisma.book.update({ where: { id: bookId }, data: { coloringPages: pages as any } });
    await flushLangfuse();
    return NextResponse.json({ success: true, added: created.length });
  } catch (error) {
    console.error("[books/page-variants POST] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

/** Select a variant as the live image (mirrors url/coloredUrl onto the page). */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId, pageId } = await params;
    const body = (await req.json().catch(() => ({}))) as { variantId?: string };
    if (!body.variantId) return NextResponse.json({ error: "variantId required" }, { status: 400 });

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const pages = (book.coloringPages as any[]) || [];
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    pages[idx] = selectVariant(pages[idx], body.variantId);
    await prisma.book.update({ where: { id: bookId }, data: { coloringPages: pages as any } });
    return NextResponse.json({ success: true, selectedVariantId: body.variantId });
  } catch (error) {
    console.error("[books/page-variants PATCH] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
```

- [ ] **Step 3: Write the DELETE route**

Create `apps/admin/src/app/api/books/[bookId]/pages/[pageId]/variants/[variantId]/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { deleteVariant } from "@vx/coloring/data/page-variants";

type RouteParams = { params: Promise<{ bookId: string; pageId: string; variantId: string }> };

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId, pageId, variantId } = await params;
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const pages = (book.coloringPages as any[]) || [];
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    pages[idx] = deleteVariant(pages[idx], variantId); // throws on selected/original
    await prisma.book.update({ where: { id: bookId }, data: { coloringPages: pages as any } });
    return NextResponse.json({ success: true, removed: variantId });
  } catch (error) {
    console.error("[books/page-variants DELETE] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
```

- [ ] **Step 4: Sync coloredUrl into the selected variant (colorize route)**

In `apps/admin/src/app/api/coloring-styles/colorize/route.ts`, inside the `if (existingIdx >= 0) { ... }` block (currently sets coloredUrl/coloringStyleId/coloringVariantId, ~lines 129-135), add variant sync after the existing three assignments:
```ts
        if (existingIdx >= 0) {
          coloringPages[existingIdx].coloredUrl = coloredUrlWithBust;
          coloringPages[existingIdx].coloringStyleId = coloringStyleId;
          coloringPages[existingIdx].coloringVariantId = coloringVariantId ?? null;
          // D4b: keep the selected variant's coloredUrl in sync so switching
          // variants doesn't lose the colored result.
          const sel = coloringPages[existingIdx].selectedVariantId as string | undefined;
          const variants = coloringPages[existingIdx].variants as { id: string; coloredUrl?: string }[] | undefined;
          if (sel && Array.isArray(variants)) {
            const vIdx = variants.findIndex((v) => v.id === sel);
            if (vIdx >= 0) variants[vIdx].coloredUrl = coloredUrlWithBust;
          }
        } else {
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/admin && yarn typecheck`
Expected: no new errors vs baseline. (Confirms the helper import path resolves and route types are sound.)

- [ ] **Step 6: Reasoning check (no route test harness)**

Write into the commit body: POST seeds the original variant then appends `count` regens (add-only, selection unchanged); anchors on the original's url; source B appends `page.prompt` to the redesign prompt (falls back to A if empty). PATCH mirrors the chosen variant onto url/coloredUrl. DELETE refuses selected/original (helper throws → 400). Colorize now also writes coloredUrl into the selected variant. All address pages by `id`.

- [ ] **Step 7: Commit**

```bash
git add "apps/admin/src/app/api/books/[bookId]/pages/[pageId]/variants" \
  apps/admin/src/app/api/coloring-styles/colorize/route.ts
git commit -m "feat(api): book page variant routes (regen-add/select/delete) + colorize sync (D4b T-012/013/014)"
```

---

## Task 4: `use-page-variants` hook

**Files:**
- Create: `packages/coloring/src/data/use-page-variants.ts`

**Interfaces:**
- Consumes: the routes from Task 3.
- Produces: `usePageVariants(bookId) → { enabled, regenAdd(pageId, opts), select(pageId, variantId), remove(pageId, variantId) }` where `opts = { count: number; source: "A" | "B"; changePercent: number }`.

- [ ] **Step 1: Write the hook**

Create `packages/coloring/src/data/use-page-variants.ts`:
```ts
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost, httpPatch, httpDel } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

export interface RegenAddOpts { count: number; source: "A" | "B"; changePercent: number }

/** D4b: non-destructive per-page variant actions (regen-add / select / delete). */
export function usePageVariants(bookId: string) {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
  const base = `${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}/pages`;
  const guard = () => { if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY); };

  return {
    enabled: COLORING_WRITE_ENABLED,
    regenAdd: async (pageId: string, opts: RegenAddOpts) => {
      guard();
      await httpPost(`${base}/${encodeURIComponent(pageId)}/variants`, opts);
      inval();
    },
    select: async (pageId: string, variantId: string) => {
      guard();
      await httpPatch(`${base}/${encodeURIComponent(pageId)}/variants`, { variantId });
      inval();
    },
    remove: async (pageId: string, variantId: string) => {
      guard();
      await httpDel(`${base}/${encodeURIComponent(pageId)}/variants/${encodeURIComponent(variantId)}`);
      inval();
    },
  };
}
```
(`httpPost`/`httpPatch`/`httpDel` are all exported from `@vx/core-uikit/api`.)

- [ ] **Step 2: Typecheck**

Run: `cd apps/admin && yarn typecheck`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add packages/coloring/src/data/use-page-variants.ts
git commit -m "feat(coloring): use-page-variants hook (D4b)"
```

---

## Task 5: Preview-modal UI — Regen Thêm ×N + variant grid

**Files:**
- Modify: `packages/coloring/src/screens/books/page-actions-row.tsx`

**Interfaces:**
- Consumes: `usePageVariants` (Task 4); `PageVariant` from `../../data/types`.
- Produces: no exports (UI).

- [ ] **Step 1: Imports + hook + local state**

In `page-actions-row.tsx`, add imports after the existing ones:
```ts
import { usePageVariants, type RegenAddOpts } from "../../data/use-page-variants";
import type { PageVariant } from "../../data/types";
```
Inside `PageActionsRow`, after `const actions = usePageActions(bookId, cloneJobId);`:
```ts
  const variants = usePageVariants(bookId);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenOpts, setRegenOpts] = useState<RegenAddOpts>({ count: 2, source: "A", changePercent: 30 });
```

- [ ] **Step 2: Add the "Regen Thêm ×N" button**

In the action bar, after the `actions.canRegen` block (the `Đổi góc` button, ~line 129), add (always shown — book-level, no cloneJobId needed):
```tsx
        <Button variant="outline" size="sm" disabled={disabled || busy !== null}
          title="Sinh thêm biến thể (không ghi đè) — chọn nguồn A/B" onClick={() => setRegenOpen((v) => !v)}>
          <Icon name="sparkles" size={15} /> Regen Thêm
        </Button>
```

- [ ] **Step 3: Add the Regen Thêm panel + variant grid**

Immediately after the closing `</div>` of the action bar (the div opened at ~line 94, closed at ~line 151), insert:
```tsx
      {regenOpen && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: 10, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--neutral-100)" }}>
          <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>Nguồn
            <select value={regenOpts.source} onChange={(e) => setRegenOpts((o) => ({ ...o, source: e.target.value as "A" | "B" }))}
              style={{ padding: "4px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--card)" }}>
              <option value="A">A · New Source</option>
              <option value="B">B · + Prompt gốc</option>
            </select>
          </label>
          <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>Số bản
            <input type="number" min={1} max={4} value={regenOpts.count}
              onChange={(e) => setRegenOpts((o) => ({ ...o, count: Math.min(4, Math.max(1, Number(e.target.value) || 1)) }))}
              style={{ width: 56, padding: "4px 8px", fontFamily: "var(--font-mono)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--card)" }} />
          </label>
          <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>% đổi
            <input type="number" min={5} max={95} step={5} value={regenOpts.changePercent}
              onChange={(e) => setRegenOpts((o) => ({ ...o, changePercent: Math.min(95, Math.max(5, Number(e.target.value) || 30)) }))}
              style={{ width: 56, padding: "4px 8px", fontFamily: "var(--font-mono)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--card)" }} />
          </label>
          <Button size="sm" disabled={disabled || busy !== null}
            onClick={run("regenadd", () => variants.regenAdd(page.id, regenOpts), () => setRegenOpen(false))}>
            {busy === "regenadd" ? "Đang sinh…" : `Sinh ${regenOpts.count} bản`}
          </Button>
        </div>
      )}

      {page.variants && page.variants.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".04em" }}>Biến thể · {page.variants.length}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(88px,1fr))", gap: 8 }}>
            {page.variants.map((v: PageVariant) => {
              const isSel = v.id === page.selectedVariantId;
              const label = v.origin === "original" ? "Gốc" : `Regen ${v.source ?? ""}`.trim();
              return (
                <div key={v.id} style={{ position: "relative" }}>
                  <div onClick={disabled || isSel ? undefined : run("selvar", () => variants.select(page.id, v.id))}
                    style={{ aspectRatio: "1 / 1", borderRadius: "var(--radius-sm)", overflow: "hidden", border: `${isSel ? 2 : 1}px solid ${isSel ? "var(--volt-600)" : "var(--border)"}`, boxShadow: isSel ? "var(--shadow-glow)" : undefined, background: "#fff", cursor: disabled || isSel ? "default" : "pointer" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={resolveImg(v.coloredUrl || v.url)} alt={label} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <span style={{ position: "absolute", left: 4, bottom: 4, fontSize: 9, fontWeight: 700, color: "#fff", background: "rgba(11,13,12,.6)", padding: "0 4px", borderRadius: 4 }}>{label}</span>
                  {isSel && <span style={{ position: "absolute", right: 4, top: 4, background: "var(--volt-500)", color: "var(--carbon-950)", borderRadius: 99, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={10} /></span>}
                  {!isSel && v.origin !== "original" && (
                    <button type="button" title="Xoá biến thể" disabled={disabled || busy !== null}
                      onClick={run("delvar", () => variants.remove(page.id, v.id))}
                      style={{ position: "absolute", right: 4, top: 4, background: "rgba(11,13,12,.6)", color: "#fff", border: "none", borderRadius: 99, width: 16, height: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="x" size={10} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Typecheck + coloring tests**

Run: `cd apps/admin && yarn typecheck` (expect no new errors)
Run: `cd packages/coloring && yarn test` (expect the full suite green)

- [ ] **Step 5: Commit**

```bash
git add packages/coloring/src/screens/books/page-actions-row.tsx
git commit -m "feat(coloring): Regen Thêm ×N + variant grid in page preview modal (D4b T-012/013)"
```

---

## Task 6: Batch tab — Regen Thêm (Add) alongside overwrite batch

**Files:**
- Modify: `packages/coloring/src/screens/books/page-batch-select.tsx`

**Interfaces:**
- Consumes: `usePageVariants` (Task 4); existing `runBatchRegen`, `usePageActions`.
- Produces: no exports (UI).

- [ ] **Step 1: Import the variants hook + add batch state**

In `page-batch-select.tsx`, add after the existing imports:
```ts
import { usePageVariants, type RegenAddOpts } from "../../data/use-page-variants";
```
Inside `PageBatchSelect`, after `const actions = usePageActions(bookId, cloneJobId);`:
```ts
  const variants = usePageVariants(bookId);
  const [addOpts, setAddOpts] = useState<RegenAddOpts>({ count: 1, source: "A", changePercent: 30 });
```

- [ ] **Step 2: Remove the cloneJob-only early return (allow the Add batch without a clone job)**

Replace the early return:
```ts
  if (!cloneJobId) {
    return <EmptyState icon="image" title="Không thể regen" sub="Sách này không có clone job nguồn để regen hàng loạt." />;
  }
  if (pages.length === 0) {
```
with (keep the pages guard; drop the cloneJob guard — batch Add is book-level):
```ts
  if (pages.length === 0) {
```

- [ ] **Step 3: Add the batch "Regen Thêm (Add)" runner**

After the existing `run` function (the overwrite batch, ends ~line 176), add a second runner:
```ts
  const runAdd = async () => {
    const indices = [...selected].sort((a, b) => a - b);
    if (indices.length === 0) return;
    if (!window.confirm(`Regen Thêm ${addOpts.count} bản cho ${indices.length} trang đã chọn? Thêm biến thể (KHÔNG ghi đè), tốn phí AI.`)) return;

    setRunning(true);
    setSummary(null);
    setResults(new Map());
    setProgress({ done: 0, total: indices.length });

    const res = await runBatchRegen(
      indices,
      async (i) => { setCurrent(i); await variants.regenAdd(pages[i].id, addOpts); },
      (done, index, ok) => {
        setProgress({ done, total: indices.length });
        setResults((prev) => new Map(prev).set(index, ok ? "ok" : "err"));
      },
    );

    setCurrent(null);
    setRunning(false);
    setSummary({ ok: res.ok.length, err: res.err.length });
    setSelected(new Set(res.err));
    qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
  };
```

- [ ] **Step 4: Add the Add controls to the toolbar**

In the toolbar `<div>` (the one with "Chọn tất cả" / "Regen hàng loạt"), gate the overwrite button on `cloneJobId` and add the Add controls. Replace the overwrite `<Button ...>Regen hàng loạt</Button>` with:
```tsx
        {cloneJobId && (
          <Button size="sm" variant="outline"
            disabled={disabled || running || selected.size === 0}
            title={disabled ? "Cần bật ghi thật (staging)" : "Ghi đè ảnh hiện tại (bản cũ)"}
            onClick={run}>
            <Icon name="sparkles" size={15} /> {running ? `Đang regen ${progress?.done ?? 0}/${progress?.total ?? 0}…` : "Regen hàng loạt (ghi đè)"}
          </Button>
        )}
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <select value={addOpts.source} onChange={(e) => setAddOpts((o) => ({ ...o, source: e.target.value as "A" | "B" }))} disabled={running}
            style={{ padding: "3px 6px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--card)" }}>
            <option value="A">A</option><option value="B">B</option>
          </select>
          <input type="number" min={1} max={4} value={addOpts.count} disabled={running}
            onChange={(e) => setAddOpts((o) => ({ ...o, count: Math.min(4, Math.max(1, Number(e.target.value) || 1)) }))}
            style={{ width: 46, padding: "3px 6px", fontFamily: "var(--font-mono)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--card)" }} />
        </label>
        <Button size="sm"
          disabled={disabled || running || selected.size === 0}
          title={disabled ? "Cần bật ghi thật (staging)" : "Sinh thêm biến thể (không ghi đè)"}
          onClick={runAdd}>
          <Icon name="sparkles" size={15} /> {running ? `Đang sinh ${progress?.done ?? 0}/${progress?.total ?? 0}…` : "Regen Thêm (Add)"}
        </Button>
```

- [ ] **Step 5: Typecheck + coloring tests**

Run: `cd apps/admin && yarn typecheck` (expect no new errors)
Run: `cd packages/coloring && yarn test` (expect green)

- [ ] **Step 6: Manual verification (dev, staging write enabled)**

Open a book → tab "Chọn hình": select pages → "Regen Thêm (Add)" adds K variants per page without overwriting (old "Regen hàng loạt (ghi đè)" still present when the book has a clone job). Then open a page in the preview modal (tab "Trang sách"): "Regen Thêm" panel generates variants into a grid; clicking a variant swaps the live image; deleting a non-selected variant works; the original/selected can't be deleted.

- [ ] **Step 7: Commit**

```bash
git add packages/coloring/src/screens/books/page-batch-select.tsx
git commit -m "feat(coloring): batch Regen Thêm (Add) in Chọn hình tab, keep overwrite batch (D4b T-012)"
```

---

## Self-Review

**Spec coverage (`2026-08-11-d4b-regen-add-variants-design.md`):**
- §3 data model (PageVariant + variants/selectedVariantId) → Task 1. ✅
- §4 pure helpers (ensure/add/select/delete) → Task 2. ✅
- §5 routes (POST/PATCH/DELETE) + §5.1 colorize sync → Task 3. ✅
- §6.1 hook → Task 4. ✅
- §6.2 preview modal (Regen Thêm ×N + grid) → Task 5. ✅
- §6.3 batch tab (keep overwrite + add) → Task 6. ✅
- Q1 A/B via editImage direct → Task 3 Step 2 prompt construction. ✅
- Q2 add-only + seed original → `addVariants` (no selection change) + `ensureOriginalVariant` (Task 2), POST seeds then adds (Task 3). ✅
- Q4 keep both batches → Task 6 gates overwrite on cloneJobId, adds Add. ✅
- N1 book-level no cloneJobId → routes use bookId/pageId only; batch early-return dropped. ✅

**Placeholder scan:** every code step has full code; test step has real cases + expected output. Helper import path is pinned (`@vx/coloring/data/page-variants` via a new subpath export in Task 3 Step 1) — no deferred decisions or TODOs. ✅

**Type consistency:** `PageVariant` shape identical in Task 1 (types.ts), Task 2 (helpers import it), Task 3 (routes), Task 5 (UI). `VariantPage` + helper signatures (`ensureOriginalVariant(page,newId,now)→{page,originalId}`, `addVariants`, `selectVariant`, `deleteVariant`) identical in Task 2 (def) and Task 3 (use). `RegenAddOpts { count, source, changePercent }` identical in Task 4 (hook), Task 5, Task 6. Hook method names (`regenAdd`/`select`/`remove`) identical in Task 4 (def) and Tasks 5/6 (use). Route paths `/books/[bookId]/pages/[pageId]/variants[/[variantId]]` identical in Task 3 (routes) and Task 4 (hook URLs). `source: "A" | "B"` consistent everywhere. ✅
