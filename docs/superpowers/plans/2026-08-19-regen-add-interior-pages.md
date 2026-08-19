# Regen Thêm → Additional Interior Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repurpose the book-level "Regen Thêm" button to append real additional interior pages (`origin:"additional"`) to `book.coloringPages` instead of page variants, remove the variant UI/routes/hook, and migrate existing regen variants to additional pages.

**Architecture:** A new pure module `@vx/coloring/data/additional-pages` builds additional-page objects and plans the variant→page migration. A new `POST .../pages/[pageId]/additional` route generates images (same editImage flow) and appends them as pages. The Interior render is unchanged — `bookPageTone`/`deriveBookPageLabel` already tint + label `origin:"additional"` pages. A gated worker backfill migrates existing variants.

**Tech Stack:** TypeScript, Next.js API routes, BullMQ worker (tsx scripts), Prisma, Cloudflare R2, Diaflow (editImage), Vitest, React.

## Global Constraints

- New additional pages: `BookColoringPage` with `origin:"additional"`, `parentPageNumber`, appended to the END of `coloringPages`. No `variants`/`selectedVariantId`.
- `parentPageNumber = source.parentPageNumber ?? source.sourcePageNumber ?? (sourceIndexInColoringPages + 1)` (via `additionalParentNumber`).
- Generation unchanged: `editImage(sourceUrl, prompt)` with source A/B + `changePercent`; `count` clamped 1–4, pct clamped 5–95. Source B appends the page's `prompt` to `buildRedesignPrompt(pct)` only when the page has a non-empty prompt.
- R2 key for a new page: `assets/{bookId}/pages/{newId}.png`.
- The single source of the parent rule + page shape is `additional-pages.ts`, imported by BOTH the route and the migration — no divergent copy.
- **Keep `page-variants.ts`** (the clone reproduce flow imports `mirrorUrlToSelectedVariant`). Delete only `use-page-variants.ts` + the two variant routes.
- Keep `PageVariant` / `variants?` / `selectedVariantId?` in `types.ts` (backward-compat read); stop writing them.
- Migration is idempotent + gated behind `RUN_REGEN_VARIANT_MIGRATION=1` in `deploy.sh`.
- Vietnamese UI copy.
- **Gate commands:** coloring unit tests → `cd packages/coloring && yarn test <file>`; coloring/admin typecheck (coloring has no typecheck script) → `cd apps/admin && yarn typecheck` (delta — admin baseline + `.next` noise); worker (no typecheck script) → `cd apps/worker && npx tsc --noEmit` (delta — pre-existing baseline errors in other files).

---

### Task 1: Pure module `additional-pages.ts` + subpath export

**Files:**
- Create: `packages/coloring/src/data/additional-pages.ts`
- Create: `packages/coloring/src/data/additional-pages.test.ts`
- Modify: `packages/coloring/package.json` (add `./data/additional-pages` export)

**Interfaces:**
- Produces (consumed by Tasks 2 & 4):
  ```ts
  additionalParentNumber(source: Pick<BookColoringPage,"origin"|"parentPageNumber"|"sourcePageNumber">, sourceIndex: number): number
  buildAdditionalPage(params: { id: string; url: string; parentPageNumber: number; prompt?: string; coloredUrl?: string }): BookColoringPage
  planVariantMigration(page: BookColoringPage, sourceIndex: number, newId: () => string): { page: BookColoringPage; additional: BookColoringPage[] }
  // re-export: type BookColoringPage
  ```

- [ ] **Step 1: Add the subpath export**

Edit `packages/coloring/package.json` — add to `"exports"` next to `"./data/page-variants"`:
```json
    "./data/page-variants": "./src/data/page-variants.ts",
    "./data/additional-pages": "./src/data/additional-pages.ts",
```

- [ ] **Step 2: Write the failing test**

Create `packages/coloring/src/data/additional-pages.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { additionalParentNumber, buildAdditionalPage, planVariantMigration } from "./additional-pages";
import type { BookColoringPage } from "./types";

describe("additionalParentNumber", () => {
  it("uses sourcePageNumber for an original source", () => {
    expect(additionalParentNumber({ origin: "original", sourcePageNumber: 7 }, 3)).toBe(7);
  });
  it("uses parentPageNumber for an additional source", () => {
    expect(additionalParentNumber({ origin: "additional", parentPageNumber: 5, sourcePageNumber: 99 }, 3)).toBe(5);
  });
  it("falls back to index+1 when both are missing", () => {
    expect(additionalParentNumber({}, 3)).toBe(4);
  });
});

describe("buildAdditionalPage", () => {
  it("builds an additional interior page, omitting empty optionals", () => {
    const p = buildAdditionalPage({ id: "a1", url: "/assets/x.png", parentPageNumber: 7 });
    expect(p).toMatchObject({ id: "a1", url: "/assets/x.png", origin: "additional", parentPageNumber: 7, isPublic: false });
    expect("prompt" in p).toBe(false);
    expect("coloredUrl" in p).toBe(false);
  });
  it("keeps prompt + coloredUrl when provided", () => {
    const p = buildAdditionalPage({ id: "a1", url: "/u.png", parentPageNumber: 7, prompt: "scene", coloredUrl: "/c.png" });
    expect(p.prompt).toBe("scene");
    expect(p.coloredUrl).toBe("/c.png");
  });
});

describe("planVariantMigration", () => {
  const newId = (() => { let n = 0; return () => `new-${++n}`; });

  it("no-op for a page without variants", () => {
    const page: BookColoringPage = { id: "p1", url: "/p1.png", sourcePageNumber: 2 };
    const out = planVariantMigration(page, 0, newId());
    expect(out.page).toBe(page);
    expect(out.additional).toEqual([]);
  });

  it("restores the page to its original variant and converts regens to additional pages (no dup)", () => {
    const page: BookColoringPage = {
      id: "p1",
      url: "/regen-a.png",          // a regen variant is currently live (mirrored)
      coloredUrl: "/regen-a-c.png",
      sourcePageNumber: 3,
      selectedVariantId: "vA",
      variants: [
        { id: "vO", url: "/orig.png", origin: "original", createdAt: "t" },
        { id: "vA", url: "/regen-a.png", coloredUrl: "/regen-a-c.png", origin: "regen", source: "A", prompt: "sc", createdAt: "t" },
        { id: "vB", url: "/regen-b.png", origin: "regen", source: "B", createdAt: "t" },
      ],
    };
    const out = planVariantMigration(page, 4, newId());
    // page reverted to original line-art, variant fields stripped
    expect(out.page.url).toBe("/orig.png");
    expect("coloredUrl" in out.page).toBe(false);
    expect("variants" in out.page).toBe(false);
    expect("selectedVariantId" in out.page).toBe(false);
    // two additional pages under parent 3
    expect(out.additional).toHaveLength(2);
    expect(out.additional.every((p) => p.origin === "additional" && p.parentPageNumber === 3)).toBe(true);
    expect(out.additional[0]).toMatchObject({ url: "/regen-a.png", coloredUrl: "/regen-a-c.png", prompt: "sc" });
    expect(out.additional[1]).toMatchObject({ url: "/regen-b.png" });
    // the live regen url is NOT duplicated onto the restored page
    expect(out.page.url).not.toBe("/regen-a.png");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/coloring && yarn test additional-pages`
Expected: FAIL — `./additional-pages` module does not exist yet.

- [ ] **Step 4: Implement the module**

Create `packages/coloring/src/data/additional-pages.ts`:
```ts
import type { BookColoringPage } from "./types";

export type { BookColoringPage };

/** The interior "parent number" a new additional page groups under. */
export function additionalParentNumber(
  source: Pick<BookColoringPage, "origin" | "parentPageNumber" | "sourcePageNumber">,
  sourceIndex: number,
): number {
  if (source.origin === "additional" && source.parentPageNumber != null) return source.parentPageNumber;
  if (source.sourcePageNumber != null) return source.sourcePageNumber;
  return sourceIndex + 1;
}

/** Build one additional interior page from a generated image. */
export function buildAdditionalPage(params: {
  id: string;
  url: string;
  parentPageNumber: number;
  prompt?: string;
  coloredUrl?: string;
}): BookColoringPage {
  const { id, url, parentPageNumber, prompt, coloredUrl } = params;
  return {
    id,
    url,
    isPublic: false,
    origin: "additional",
    parentPageNumber,
    ...(prompt ? { prompt } : {}),
    ...(coloredUrl ? { coloredUrl } : {}),
  };
}

/**
 * Migrate one page's regen variants to additional pages (one-time backfill).
 * - Reverts the page's url/coloredUrl to its "original" variant (so a page whose
 *   live image was a regen variant goes back to its original line-art).
 * - Converts each "regen" variant to an additional page under this page's number.
 * - Strips variants + selectedVariantId.
 * A page with no variants is returned unchanged (same reference).
 */
export function planVariantMigration(
  page: BookColoringPage,
  sourceIndex: number,
  newId: () => string,
): { page: BookColoringPage; additional: BookColoringPage[] } {
  const variants = page.variants ?? [];
  if (variants.length === 0) return { page, additional: [] };

  const parentPageNumber = additionalParentNumber(page, sourceIndex);
  const original = variants.find((v) => v.origin === "original");
  const regens = variants.filter((v) => v.origin === "regen");

  const restored: BookColoringPage = { ...page };
  delete restored.variants;
  delete restored.selectedVariantId;
  if (original) {
    restored.url = original.url;
    if (original.coloredUrl) restored.coloredUrl = original.coloredUrl;
    else delete restored.coloredUrl;
  }

  const additional = regens.map((v) =>
    buildAdditionalPage({
      id: newId(),
      url: v.url,
      parentPageNumber,
      ...(v.coloredUrl ? { coloredUrl: v.coloredUrl } : {}),
      ...(v.prompt ? { prompt: v.prompt } : {}),
    }),
  );
  return { page: restored, additional };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/coloring && yarn test additional-pages`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add packages/coloring/src/data/additional-pages.ts packages/coloring/src/data/additional-pages.test.ts packages/coloring/package.json
git commit -m "feat(interior): additional-pages pure module (build + parent + migration plan)"
```

---

### Task 2: New `POST .../pages/[pageId]/additional` route

**Files:**
- Create: `apps/admin/src/app/api/books/[bookId]/pages/[pageId]/additional/route.ts`

**Interfaces:**
- Consumes: `additionalParentNumber`, `buildAdditionalPage`, `type BookColoringPage` from `@vx/coloring/data/additional-pages` (Task 1); `editImage`, `buildRedesignPrompt`, R2 helpers, `flushLangfuse` (existing).
- Produces: `POST` generates `count` additional interior pages from the source page and appends them to `book.coloringPages`. Response `{ success: true, added }`.

- [ ] **Step 1: Create the route (additive — old variant routes stay for now)**

Create `apps/admin/src/app/api/books/[bookId]/pages/[pageId]/additional/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@vx/db";
import { editImage } from "@vx/server-core/ai";
import { buildRedesignPrompt } from "@vx/server-core/ai/prompts";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import { flushLangfuse } from "@vx/server-core/langfuse";
import { additionalParentNumber, buildAdditionalPage, type BookColoringPage } from "@vx/coloring/data/additional-pages";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ bookId: string; pageId: string }> };

/**
 * Regen Thêm: generate `count` NEW additional interior pages from one source
 * page and append them to book.coloringPages (origin:"additional"). Replaces the
 * old per-page variant flow — these are full interior pages (counted/exported/PDF).
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId, pageId } = await params;
    const body = (await req.json().catch(() => ({}))) as { count?: number; source?: "A" | "B"; changePercent?: number };
    const count = Math.min(4, Math.max(1, body.count ?? 1));
    const source: "A" | "B" = body.source === "B" ? "B" : "A";
    const pct = Math.min(95, Math.max(5, body.changePercent ?? 30));

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const pages = (book.coloringPages as unknown as BookColoringPage[]) ?? [];
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    const src = pages[idx];
    const parentPageNumber = additionalParentNumber(src, idx);
    const anchorUrl = resolveR2Url(src.url);

    const originalPrompt = typeof src.prompt === "string" ? src.prompt.trim() : "";
    const useB = source === "B" && originalPrompt.length > 0;
    const prompt = useB
      ? `${buildRedesignPrompt(pct)}\n\nORIGINAL SCENE DESCRIPTION (keep faithful to this):\n${originalPrompt}`
      : buildRedesignPrompt(pct);

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const created: BookColoringPage[] = [];
    for (let k = 0; k < count; k++) {
      const img = await editImage(anchorUrl, prompt, {
        trace: { caller: "books/page-additional", entityType: "book", entityId: bookId },
      });
      const base64 = img.base64 || img.dataUrl?.split(",")[1] || "";
      const newId = crypto.randomUUID();
      const key = `assets/${bookId}/pages/${newId}.png`;
      const { url } = await uploadToR2({ client: r2Client, config: r2Config, key, body: Buffer.from(base64, "base64"), contentType: "image/png" });
      created.push(buildAdditionalPage({ id: newId, url, parentPageNumber, ...(useB ? { prompt: originalPrompt } : {}) }));
    }

    const updated = [...pages, ...created];
    await prisma.book.update({ where: { id: bookId }, data: { coloringPages: updated as never } });
    await flushLangfuse();
    return NextResponse.json({ success: true, added: created.length });
  } catch (error) {
    console.error("[books/page-additional POST] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck the admin app (delta)**

Run: `cd apps/admin && yarn typecheck`
Then: `cd apps/admin && yarn typecheck 2>&1 | grep -E "pages/\[pageId\]/additional"` → expect EMPTY.
Expected: no new errors attributable to the new route.

- [ ] **Step 3: Commit**

```bash
git add "apps/admin/src/app/api/books/[bookId]/pages/[pageId]/additional/route.ts"
git commit -m "feat(interior): POST additional route — append additional interior pages"
```

---

### Task 3: Cutover — new hook, update UI, remove variant surfaces

**Files:**
- Create: `packages/coloring/src/data/use-page-additional.ts`
- Modify: `packages/coloring/src/screens/books/page-actions-row.tsx`
- Modify: `packages/coloring/src/screens/books/page-batch-select.tsx`
- Delete: `packages/coloring/src/data/use-page-variants.ts` and `packages/coloring/src/data/use-page-variants.test.ts`
- Delete: `apps/admin/src/app/api/books/[bookId]/pages/[pageId]/variants/route.ts`
- Delete: `apps/admin/src/app/api/books/[bookId]/pages/[pageId]/variants/[variantId]/route.ts`

**Interfaces:**
- Consumes: the new `/additional` route (Task 2).
- Produces: `usePageAdditional(bookId): { enabled: boolean; regenAddPages(pageId, opts): Promise<void> }`, `type RegenAddOpts`.

- [ ] **Step 1: Create the new hook**

Create `packages/coloring/src/data/use-page-additional.ts`:
```ts
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

export interface RegenAddOpts { count: number; source: "A" | "B"; changePercent: number }

/** Book-level "Regen Thêm": generate additional interior pages appended to the book. */
export function usePageAdditional(bookId: string) {
  const qc = useQueryClient();
  const base = `${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}/pages`;
  return {
    enabled: COLORING_WRITE_ENABLED,
    regenAddPages: async (pageId: string, opts: RegenAddOpts) => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
      await httpPost(`${base}/${encodeURIComponent(pageId)}/additional`, opts);
      await qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
    },
  };
}
```

- [ ] **Step 2: Update `page-actions-row.tsx` — swap hook, drop the variant strip, fix copy**

In `packages/coloring/src/screens/books/page-actions-row.tsx`:

(a) Replace the import (line 8) and remove the now-unused `PageVariant` type import (line 13):
```ts
import { usePageAdditional, type RegenAddOpts } from "../../data/use-page-additional";
```
Delete the line `import type { PageVariant } from "../../data/types";`.

(b) Replace the hook call (line 41):
```ts
  const additional = usePageAdditional(bookId);
```

(c) Update the "Regen Thêm" button title (line 151):
```ts
            title="Sinh thêm trang interior (không ghi đè) — chọn nguồn A/B" onClick={() => setRegenOpen((v) => !v)}>
```

(d) Update the modal's generate button (lines 196–199) to call the new hook + fix copy:
```ts
          <Button size="sm" disabled={disabled || busy !== null}
            onClick={run("regenadd", () => additional.regenAddPages(page.id, regenOpts), () => setRegenOpen(false))}>
            {busy === "regenadd" ? "Đang sinh…" : `Sinh ${regenOpts.count} trang`}
          </Button>
```

(e) Delete the entire "BIẾN THỂ" strip block (lines 203–231 — the `{!isSC && page.variants && page.variants.length > 0 && ( ... )}` JSX). Remove it completely.

- [ ] **Step 3: Update `page-batch-select.tsx` — swap hook + fix copy**

In `packages/coloring/src/screens/books/page-batch-select.tsx`:

(a) Replace the import:
```ts
import { usePageAdditional, type RegenAddOpts } from "../../data/use-page-additional";
```

(b) Replace the hook call (currently `const variants = usePageVariants(bookId);`):
```ts
  const additional = usePageAdditional(bookId);
```

(c) In `runAdd`, update the confirm text and the call. Replace the confirm line:
```ts
    if (!window.confirm(`Regen Thêm ${addOpts.count} bản cho ${indices.length} trang đã chọn? Thêm biến thể (KHÔNG ghi đè), tốn phí AI.`)) return;
```
with:
```ts
    if (!window.confirm(`Sinh thêm ${addOpts.count} trang interior mới từ ${indices.length} trang đã chọn? Các trang mới sẽ nằm ở cuối, KHÔNG ghi đè. Tốn phí AI.`)) return;
```
and replace the per-item call:
```ts
      async (i) => { setCurrent(i); await additional.regenAddPages(pages[i].id, addOpts); },
```

- [ ] **Step 4: Delete the variant hook, its test, and the variant routes**

```bash
git rm packages/coloring/src/data/use-page-variants.ts packages/coloring/src/data/use-page-variants.test.ts
git rm "apps/admin/src/app/api/books/[bookId]/pages/[pageId]/variants/route.ts"
git rm "apps/admin/src/app/api/books/[bookId]/pages/[pageId]/variants/[variantId]/route.ts"
```
Then confirm nothing else still imports the deleted hook or its exported helpers:
`grep -rn "use-page-variants\|usePageVariants\|applyVariantSelection\|applyVariantRemoval\|RegenAddOpts" packages apps --include=*.ts --include=*.tsx | grep -v node_modules` → the only `RegenAddOpts` hits must be `use-page-additional.ts` / `page-actions-row.tsx` / `page-batch-select.tsx`; there must be NO `use-page-variants` / `usePageVariants` / `applyVariant*` hits. (`page-variants.ts` — WITHOUT the `use-` prefix — must still exist; the reproduce flow needs it.)

- [ ] **Step 5: Typecheck (delta)**

Run: `cd apps/admin && yarn typecheck`
Then: `cd apps/admin && yarn typecheck 2>&1 | grep -E "page-actions-row|page-batch-select|use-page-additional|use-page-variants"` → expect EMPTY.
Expected: no new errors; no dangling reference to the deleted hook.

- [ ] **Step 6: Commit**

```bash
git add packages/coloring/src/data/use-page-additional.ts packages/coloring/src/screens/books/page-actions-row.tsx packages/coloring/src/screens/books/page-batch-select.tsx
git commit -m "feat(interior): cutover Regen Thêm to additional pages; remove variant UI + routes"
```

---

### Task 4: One-time migration (worker backfill)

**Files:**
- Create: `apps/worker/src/scripts/backfill-regen-variants-to-pages.ts`
- Modify: `apps/worker/package.json` (add `@vx/coloring` dep + a `backfill:regen-variants` script)
- Modify: `deploy.sh` (add a gated migration step)

**Interfaces:**
- Consumes: `planVariantMigration` from `@vx/coloring/data/additional-pages` (Task 1); `db` from `../db`.

- [ ] **Step 1: Add `@vx/coloring` to the worker + a script alias**

Edit `apps/worker/package.json` — add to `"dependencies"`:
```json
    "@vx/coloring": "workspace:*",
```
and add to `"scripts"` (next to `backfill:book-approved`):
```json
    "backfill:regen-variants": "node --import tsx src/scripts/backfill-regen-variants-to-pages.ts",
```
Then run `yarn install` from the repo root so the workspace link resolves.

- [ ] **Step 2: Write the migration script**

Create `apps/worker/src/scripts/backfill-regen-variants-to-pages.ts`:
```ts
/**
 * One-time migration: convert legacy per-page regen VARIANTS into real
 * additional INTERIOR pages. For each book page with variants:
 *   - revert the page to its "original" variant (url/coloredUrl),
 *   - append one additional page (origin:"additional") per "regen" variant,
 *   - strip variants + selectedVariantId.
 * Idempotent: a page without variants is left untouched.
 *
 * Usage:
 *   yarn backfill:regen-variants            # migrate
 *   yarn backfill:regen-variants --dry-run  # report only
 */
import crypto from "node:crypto";
import { db } from "../db";
import { planVariantMigration, type BookColoringPage } from "@vx/coloring/data/additional-pages";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const books = await db.book.findMany({ select: { id: true, coloringPages: true } });
  let booksChanged = 0;
  let pagesAdded = 0;

  for (const b of books) {
    const pages = (b.coloringPages as unknown as BookColoringPage[]) ?? [];
    const restored: BookColoringPage[] = [];
    const extra: BookColoringPage[] = [];
    let touched = false;

    pages.forEach((p, i) => {
      const hadVariants = Array.isArray(p.variants) && p.variants.length > 0;
      const r = planVariantMigration(p, i, () => crypto.randomUUID());
      restored.push(r.page);
      extra.push(...r.additional);
      if (hadVariants) touched = true;
    });

    if (!touched) continue;
    booksChanged++;
    pagesAdded += extra.length;
    if (!dryRun) {
      await db.book.update({
        where: { id: b.id },
        data: { coloringPages: [...restored, ...extra] as never },
      });
    }
  }

  console.log(
    `[backfill-regen-variants] ${dryRun ? "(dry-run) " : ""}books changed: ${booksChanged}, additional pages created: ${pagesAdded}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Add the gated deploy step**

In `deploy.sh`, after the `[3c]` book-approved backfill block (the `fi` that closes the `RUN_BOOK_APPROVED_BACKFILL` conditional) and before `# 4. Start app containers`, add:
```bash
# 3d. ONE-TIME migration: convert legacy regen variants → additional interior
#     pages. Gated behind RUN_REGEN_VARIANT_MIGRATION (idempotent, but must not
#     run on every deploy). Run once:  RUN_REGEN_VARIANT_MIGRATION=1 ./deploy.sh
if [ "${RUN_REGEN_VARIANT_MIGRATION:-0}" = "1" ]; then
    echo "[3d] One-time migration: regen variants → additional interior pages..."
    ssh ${SSH_OPTS} ${SERVER} "cd ${REMOTE_DIR} && \
        docker compose ${COMPOSE_FILES} run --rm --no-deps \
            -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/coloring \
            -e DIRECT_URL=postgresql://postgres:postgres@postgres:5432/coloring \
            worker sh -c 'cd /app/apps/worker && node --import tsx src/scripts/backfill-regen-variants-to-pages.ts'"
else
    echo "[3d] Skipping regen-variant migration (set RUN_REGEN_VARIANT_MIGRATION=1 to run once)."
fi
```

- [ ] **Step 4: Typecheck the worker (delta)**

Run: `cd apps/worker && npx tsc --noEmit`
Then: `cd apps/worker && npx tsc --noEmit 2>&1 | grep backfill-regen-variants` → expect EMPTY.
Expected: the new script has no type errors (worker baseline errors in other files unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/scripts/backfill-regen-variants-to-pages.ts apps/worker/package.json deploy.sh yarn.lock
git commit -m "feat(interior): one-time migration regen variants -> additional pages"
```

---

### Task 5: Staging verification (manual)

**Files:** none.

- [ ] **Step 1: Deploy the branch (merged to main) to prod** with the migration gate on the first run: `RUN_REGEN_VARIANT_MIGRATION=1 ./deploy.sh` (scp server `.env.prod` down first, per the deploy-overwrites-prod-env guardrail).

- [ ] **Step 2: Migration result** — the deploy's `[3d]` log prints `books changed: N, additional pages created: M`. Open a book that previously had regen variants (e.g. the "Cute farm" book's page with "Regen A"): the variant strip is gone; the page shows its original line-art; a new tinted page `#<parent>·A1` appears at the END of the Interior list.

- [ ] **Step 3: New Regen Thêm** — open an interior page → "Regen Thêm" → source A, count 2 → after generation, 2 new pages appear at the END of the Interior section with the `additional` background tint and `#<parent>·A1`/`A2` labels. The page count increases; the ZIP export and generated PDF include them.

- [ ] **Step 4: Delete + batch** — delete one additional page via "Xóa" (it disappears from Interior and the count drops). In the "Chọn hình" tab, select a page → "Regen Thêm (Add)" → confirm the new copy → additional pages append at the end.

---

## Notes for the implementer

- `page-variants.ts` (no `use-` prefix) MUST remain — the clone reproduce flow imports `mirrorUrlToSelectedVariant` from it. Only `use-page-variants.ts` (the hook) is deleted.
- The Interior render in `book-detail-screen.tsx` is intentionally untouched: `bookPageTone("interior", p)` already returns `"additional"` for `origin:"additional"` pages and `deriveBookPageLabel` already produces `#<parent>·A<rank>` — appended additional pages render correctly with no render change.
- `additional-pages.ts` is pure (imports only the `BookColoringPage` type) so it is safe to import from the worker without pulling React.
- Do not remove `PageVariant` / `variants?` / `selectedVariantId?` from `types.ts` — kept for reading any un-migrated data.
