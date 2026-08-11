# Coloring Style — Usage Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show, in the coloring-style detail screen, every book page colorized with that style — grouped by the color variant used — with each image linking to its book, so operators can judge the style's quality.

**Architecture:** A read-only `GET /api/coloring-styles/[id]/usages` route finds books whose `coloringPages` used the style (Prisma `array_contains` → jsonb `@>`) and returns a flat `usages[]`. A pure `groupUsagesByVariant` helper (unit-tested) buckets usages by variant; a `useStyleUsages` react-query hook fetches; a `StyleUsagesSection` component renders the grouped gallery in the existing style detail screen.

**Tech Stack:** TypeScript, React (`@vx/coloring`), Next.js API routes, Prisma (`@vx/db`), TanStack Query, Vitest. No new dependencies, no schema change.

## Global Constraints

- **Source is per-page** `coloringPages[].coloringStyleId === styleId` (the authoritative colorize signal, incl. interior + cover pages) — NOT `coverMeta`.
- **Read-only:** plain GET; no write flag, no schema change, no mutation.
- **Group by variant:** one block per color variant with swatches + `Bảng màu N` label + count; usages with null/unknown `coloringVariantId` go into ONE trailing group `"Khác · không rõ bảng màu"`; empty groups omitted; known-variant groups ordered by their index in the style's `variants`.
- **Interaction:** click an image → `router.push(`${COLORING_BASE}/books/{bookId}`)`. No inline actions.
- **Soft cap:** at most 24 images per group; overflow shown as a `+N` tile.
- **`StyleUsage` shape:** `{ bookId: string; bookTitle: string; pageId: string; coloredUrl: string; coloringVariantId: string | null }`.
- **Typecheck gate:** `@vx/coloring` has no typecheck script → `cd apps/admin && yarn typecheck` (baseline `.next/dev/types/routes.d.ts` noise; judge by delta). Coloring tests: `cd packages/coloring && yarn vitest run <file>`.

---

## File Structure

**Create:**
- `packages/coloring/src/data/group-style-usages.ts` — types + `groupUsagesByVariant`.
- `packages/coloring/src/data/group-style-usages.test.ts` — helper unit tests.
- `packages/coloring/src/data/use-style-usages.ts` — react-query hook.
- `packages/coloring/src/screens/entity/style-usages-section.tsx` — the gallery section.
- `apps/admin/src/app/api/coloring-styles/[id]/usages/route.ts` — GET usages.

**Modify:**
- `packages/coloring/src/screens/entity/entity-detail-screen.tsx` — render `<StyleUsagesSection>`.

---

## Task 1: Pure grouping helper

**Files:**
- Create: `packages/coloring/src/data/group-style-usages.ts`
- Test: `packages/coloring/src/data/group-style-usages.test.ts`

**Interfaces:**
- Produces:
  - `interface StyleUsage { bookId: string; bookTitle: string; pageId: string; coloredUrl: string; coloringVariantId: string | null }`
  - `interface UsageVariant { id?: string; colorPalette?: { primaryColors?: string[] } }`
  - `interface UsageGroup { variantId: string | null; label: string; swatches: string[]; usages: StyleUsage[] }`
  - `groupUsagesByVariant(usages: StyleUsage[], variants: UsageVariant[] | undefined): UsageGroup[]`

- [ ] **Step 1: Write the failing test**

Create `packages/coloring/src/data/group-style-usages.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { groupUsagesByVariant, type StyleUsage, type UsageVariant } from "./group-style-usages";

const u = (id: string, vId: string | null): StyleUsage => ({
  bookId: `b${id}`, bookTitle: `Book ${id}`, pageId: `p${id}`, coloredUrl: `/c/${id}.png`, coloringVariantId: vId,
});
const variants: UsageVariant[] = [
  { id: "v1", colorPalette: { primaryColors: ["#f00", "#0f0"] } },
  { id: "v2", colorPalette: { primaryColors: ["#00f"] } },
];

describe("groupUsagesByVariant", () => {
  it("groups by variant in variant order, with label + swatches", () => {
    const out = groupUsagesByVariant([u("1", "v2"), u("2", "v1"), u("3", "v1")], variants);
    expect(out.map((g) => [g.variantId, g.label, g.swatches, g.usages.map((x) => x.pageId)])).toEqual([
      ["v1", "Bảng màu 1", ["#f00", "#0f0"], ["p2", "p3"]],
      ["v2", "Bảng màu 2", ["#00f"], ["p1"]],
    ]);
  });

  it("puts null/unknown variantId into one trailing 'Khác' group", () => {
    const out = groupUsagesByVariant([u("1", null), u("2", "vX"), u("3", "v1")], variants);
    expect(out.map((g) => [g.variantId, g.label, g.usages.map((x) => x.pageId)])).toEqual([
      ["v1", "Bảng màu 1", ["p3"]],
      [null, "Khác · không rõ bảng màu", ["p1", "p2"]],
    ]);
  });

  it("omits empty variant groups", () => {
    const out = groupUsagesByVariant([u("1", "v1")], variants);
    expect(out.map((g) => g.variantId)).toEqual(["v1"]);
  });

  it("returns [] for no usages", () => {
    expect(groupUsagesByVariant([], variants)).toEqual([]);
  });

  it("puts everything in 'Khác' when variants is undefined", () => {
    const out = groupUsagesByVariant([u("1", "v1")], undefined);
    expect(out.map((g) => [g.variantId, g.usages.map((x) => x.pageId)])).toEqual([[null, ["p1"]]]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/coloring && yarn vitest run src/data/group-style-usages.test.ts`
Expected: FAIL — module `./group-style-usages` not found.

- [ ] **Step 3: Write the helper**

Create `packages/coloring/src/data/group-style-usages.ts`:
```ts
/** One book page colorized with a given coloring style. */
export interface StyleUsage {
  bookId: string;
  bookTitle: string;
  pageId: string;
  coloredUrl: string;
  coloringVariantId: string | null;
}

/** Minimal shape of a ColoringStyle color variant needed for grouping. */
export interface UsageVariant {
  id?: string;
  colorPalette?: { primaryColors?: string[] };
}

/** Usages bucketed under one color variant (or the trailing "unknown" bucket). */
export interface UsageGroup {
  variantId: string | null;
  label: string;
  swatches: string[];
  usages: StyleUsage[];
}

/** Group usages by coloringVariantId. Known variants (in `variants` order) each get a
 *  "Bảng màu N" group with the variant's primaryColors as swatches; usages whose
 *  variantId is null or matches no variant fall into one trailing "Khác" group. Empty
 *  groups are omitted. */
export function groupUsagesByVariant(
  usages: StyleUsage[],
  variants: UsageVariant[] | undefined,
): UsageGroup[] {
  const list = variants ?? [];
  const groups: UsageGroup[] = [];
  const claimed = new Set<StyleUsage>();

  list.forEach((v, i) => {
    if (!v.id) return;
    const vUsages = usages.filter((usage) => usage.coloringVariantId === v.id);
    if (vUsages.length === 0) return;
    vUsages.forEach((usage) => claimed.add(usage));
    groups.push({
      variantId: v.id,
      label: `Bảng màu ${i + 1}`,
      swatches: v.colorPalette?.primaryColors ?? [],
      usages: vUsages,
    });
  });

  const rest = usages.filter((usage) => !claimed.has(usage));
  if (rest.length > 0) {
    groups.push({ variantId: null, label: "Khác · không rõ bảng màu", swatches: [], usages: rest });
  }
  return groups;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/coloring && yarn vitest run src/data/group-style-usages.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add packages/coloring/src/data/group-style-usages.ts packages/coloring/src/data/group-style-usages.test.ts
git commit -m "feat(coloring): groupUsagesByVariant pure helper"
```

---

## Task 2: Usages API route

**Files:**
- Create: `apps/admin/src/app/api/coloring-styles/[id]/usages/route.ts`

**Interfaces:**
- Produces: `GET /api/coloring-styles/[id]/usages` → `{ usages: StyleUsage[] }` where `StyleUsage` is the shape from Task 1 (`{ bookId, bookTitle, pageId, coloredUrl, coloringVariantId }`).

- [ ] **Step 1: Write the route**

Create `apps/admin/src/app/api/coloring-styles/[id]/usages/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";

type PageEntry = {
  id?: string;
  coloringStyleId?: string | null;
  coloringVariantId?: string | null;
  coloredUrl?: string | null;
};

type Usage = {
  bookId: string;
  bookTitle: string;
  pageId: string;
  coloredUrl: string;
  coloringVariantId: string | null;
};

/** GET the book pages colorized with this coloring style (per-page coloringStyleId). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    // jsonb @>: only books whose coloringPages array has an element with this styleId.
    const books = await prisma.book.findMany({
      where: { coloringPages: { array_contains: [{ coloringStyleId: id }] } },
      select: { id: true, title: true, coloringPages: true },
    });

    const usages: Usage[] = [];
    for (const book of books) {
      const pages = (book.coloringPages as PageEntry[] | null) ?? [];
      for (const p of pages) {
        if (p.coloringStyleId === id && p.id && p.coloredUrl) {
          usages.push({
            bookId: book.id,
            bookTitle: book.title ?? "",
            pageId: p.id,
            coloredUrl: p.coloredUrl,
            coloringVariantId: p.coloringVariantId ?? null,
          });
        }
      }
    }
    return NextResponse.json({ usages });
  } catch (error) {
    console.error("[coloring-styles/usages GET] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/admin && yarn typecheck`
Expected: no new errors vs baseline. (If Prisma's Json filter rejects the `array_contains` literal, the fix is to cast: `array_contains: [{ coloringStyleId: id }] as Prisma.InputJsonValue` with `import { Prisma } from "@vx/db"` — but the plain literal is expected to typecheck.)

- [ ] **Step 3: Reasoning check (no route test harness)**

Write into the commit body: the `array_contains` filter narrows to books whose `coloringPages` contains a page with `coloringStyleId === id` (jsonb `@>`); the JS pass keeps only pages that actually match the style AND have an `id` + `coloredUrl`, emitting one usage each; a style with no usages returns `{ usages: [] }` (not an error). Read-only — no writes.

- [ ] **Step 4: Commit**

```bash
git add "apps/admin/src/app/api/coloring-styles/[id]/usages/route.ts"
git commit -m "feat(api): coloring-style usages route (pages colorized with a style)"
```

---

## Task 3: `useStyleUsages` hook

**Files:**
- Create: `packages/coloring/src/data/use-style-usages.ts`

**Interfaces:**
- Consumes: `StyleUsage` from `./group-style-usages` (Task 1); the route from Task 2.
- Produces: `useStyleUsages(styleId: string) → { usages: StyleUsage[]; isLoading: boolean; isError: boolean }`.

- [ ] **Step 1: Write the hook**

Create `packages/coloring/src/data/use-style-usages.ts`:
```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { httpGet } from "@vx/core-uikit/api";
import { COLORING_API_BASE } from "./config";
import type { StyleUsage } from "./group-style-usages";

export interface UseStyleUsagesResult {
  usages: StyleUsage[];
  isLoading: boolean;
  isError: boolean;
}

/** Read-only: the book pages colorized with `styleId` (GET .../coloring-styles/{id}/usages). */
export function useStyleUsages(styleId: string): UseStyleUsagesResult {
  const query = useQuery({
    queryKey: ["coloring", "style-usages", styleId],
    queryFn: () =>
      httpGet<{ usages: StyleUsage[] }>(
        `${COLORING_API_BASE}/coloring-styles/${encodeURIComponent(styleId)}/usages`,
      ),
    enabled: Boolean(styleId),
  });
  return { usages: query.data?.usages ?? [], isLoading: query.isLoading, isError: query.isError };
}
```
(Mirrors the existing `use-entity.ts` / `use-entity-list.ts` read-only hooks — `useQuery` + `httpGet` from `@vx/core-uikit/api`, `COLORING_API_BASE` from `./config`.)

- [ ] **Step 2: Typecheck**

Run: `cd apps/admin && yarn typecheck`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add packages/coloring/src/data/use-style-usages.ts
git commit -m "feat(coloring): use-style-usages hook"
```

---

## Task 4: `StyleUsagesSection` + wire into style detail

**Files:**
- Create: `packages/coloring/src/screens/entity/style-usages-section.tsx`
- Modify: `packages/coloring/src/screens/entity/entity-detail-screen.tsx`

**Interfaces:**
- Consumes: `useStyleUsages` (Task 3); `groupUsagesByVariant` + `UsageVariant` + `UsageGroup` from `../../data/group-style-usages` (Task 1); `Card` from `../../components/ui/card`; `LoadingRows` from `../../components/ui/states`; `resolveImg` from `../../data/img`; `COLORING_BASE` from `../../components/shell/nav-config`.
- Produces: `export function StyleUsagesSection({ styleId, variants }: { styleId: string; variants: UsageVariant[] | undefined })`.

- [ ] **Step 1: Write the section component**

Create `packages/coloring/src/screens/entity/style-usages-section.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { Card } from "../../components/ui/card";
import { LoadingRows } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { resolveImg } from "../../data/img";
import { useStyleUsages } from "../../data/use-style-usages";
import { groupUsagesByVariant, type UsageVariant, type UsageGroup } from "../../data/group-style-usages";

const CAP = 24;

/** Gallery of book pages colorized with this style, grouped by color variant.
 *  Read-only; click an image to open its book. Rendered only for coloring-styles. */
export function StyleUsagesSection({ styleId, variants }: { styleId: string; variants: UsageVariant[] | undefined }) {
  const router = useRouter();
  const { usages, isLoading } = useStyleUsages(styleId);
  const groups = groupUsagesByVariant(usages, variants);

  return (
    <Card title={`Đã dùng để tô · ${usages.length}`}>
      {isLoading ? (
        <LoadingRows rows={2} />
      ) : usages.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Chưa có trang nào tô bằng style này.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {groups.map((g) => (
            <UsageGroupBlock key={g.variantId ?? "__unknown__"} group={g} onOpen={(bookId) => router.push(`${B}/books/${bookId}`)} />
          ))}
        </div>
      )}
    </Card>
  );
}

function UsageGroupBlock({ group, onOpen }: { group: UsageGroup; onOpen: (bookId: string) => void }) {
  const shown = group.usages.slice(0, CAP);
  const overflow = group.usages.length - shown.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {group.swatches.length > 0 && (
          <div style={{ display: "flex", gap: 3 }}>
            {group.swatches.slice(0, 6).map((c, i) => (
              <span key={i} title={c} style={{ width: 16, height: 16, borderRadius: 4, background: c, border: "1px solid var(--border)" }} />
            ))}
          </div>
        )}
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{group.label}</span>
        <span style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>· {group.usages.length}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(96px,1fr))", gap: 8 }}>
        {shown.map((u) => (
          <button key={u.pageId} type="button" onClick={() => onOpen(u.bookId)} title={u.bookTitle}
            style={{ padding: 0, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden", background: "#fff", cursor: "pointer", aspectRatio: "1 / 1" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resolveImg(u.coloredUrl)} alt={u.bookTitle} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </button>
        ))}
        {overflow > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", aspectRatio: "1 / 1", border: "1px dashed var(--border)", borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 600, color: "var(--muted-foreground)" }}>+{overflow}</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the style detail screen**

In `packages/coloring/src/screens/entity/entity-detail-screen.tsx`, add the import after the `ColorVariantsSection` import (line ~18):
```ts
import { StyleUsagesSection } from "./style-usages-section";
import type { UsageVariant } from "../../data/group-style-usages";
```
Then immediately after the existing `ColorVariantsSection` line (line ~198):
```tsx
      {kind === "coloring-styles" && <ColorVariantsSection variants={entity.variants} styleId={id} />}
```
add:
```tsx
      {kind === "coloring-styles" && <StyleUsagesSection styleId={id} variants={entity.variants as UsageVariant[] | undefined} />}
```

- [ ] **Step 3: Typecheck + coloring tests**

Run: `cd apps/admin && yarn typecheck` (expect no new errors)
Run: `cd packages/coloring && yarn test` (expect the full suite green)

- [ ] **Step 4: Manual verification (dev, tunnel to prod DB)**

Open a coloring-style detail (`/entity/coloring-styles/<id>`) that has been used to colorize pages: the "Đã dùng để tô · N" card lists the colored pages, grouped into "Bảng màu N" blocks (with swatches) plus a trailing "Khác" block for pages whose variant is unknown; clicking an image opens `/books/<bookId>`; a never-used style shows "Chưa có trang nào tô bằng style này."

- [ ] **Step 5: Commit**

```bash
git add packages/coloring/src/screens/entity/style-usages-section.tsx packages/coloring/src/screens/entity/entity-detail-screen.tsx
git commit -m "feat(coloring): style usage gallery in coloring-style detail"
```

---

## Self-Review

**Spec coverage (`2026-08-11-style-usage-gallery-design.md`):**
- §4 API (`array_contains` query + per-page filter → `{ usages }`) → Task 2. ✅
- §5 pure helper `groupUsagesByVariant` (variant order, label, swatches, trailing unknown, omit empty) → Task 1. ✅
- §6 hook `useStyleUsages` → Task 3. ✅
- §7 `StyleUsagesSection` (Card, loading/empty, grouped grid, click→book, 24-cap + `+N`) + wired after `ColorVariantsSection` → Task 4. ✅
- Decision "per-page source" → Task 2 (`coloringStyleId` per page, not coverMeta). ✅
- Decision "group by variant" → Task 1 + Task 4. ✅
- Decision "click → book detail" → Task 4 (`router.push(`${B}/books/{bookId}`)`). ✅
- Decision "read-only" → Task 2 GET only. ✅
- §8 tests → Task 1 (`group-style-usages.test.ts`); route reasoning check → Task 2 Step 3; manual → Task 4 Step 4. ✅

**Placeholder scan:** every code step has full code; the test step has real cases + expected values; the route reasoning check is explicit; no TODO/TBD. ✅

**Type consistency:** `StyleUsage` (`{bookId,bookTitle,pageId,coloredUrl,coloringVariantId}`) identical in Task 1 (def), Task 2 (route `Usage` type has the same fields + shape), Task 3 (hook imports it). `groupUsagesByVariant(usages, variants)` + `UsageVariant`/`UsageGroup` identical in Task 1 (def) and Task 4 (use). Hook `useStyleUsages(styleId)→{usages,isLoading,isError}` identical in Task 3 (def) and Task 4 (use). Route path `/coloring-styles/{id}/usages` identical in Task 2 (route) and Task 3 (hook URL). `CAP = 24` matches the spec's soft cap. ✅
