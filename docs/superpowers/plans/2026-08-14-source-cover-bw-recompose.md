# Source Cover (B&W recompose) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand way to convert an interior page into a B&W "source cover" (line-art recomposed into a cover layout with a reserved title-safe area), colorizable via the existing per-page flow, all runnable locally.

**Architecture:** A new Diaflow B&W-recompose prompt + `generateCoverSourceBW()` power a synchronous, Redis-free route `POST /api/books/[bookId]/source-covers`. Source covers live in `book.data.sourceCovers[]` (isolated from `coloringPages`). The Book detail "Trang sách" tab gets a "Source Cover" section with 3 Gen buttons + an interior-picker dialog; clicking a source cover reuses `PageActionsRow` in a source-cover mode. Colorizing sets `coloredUrl` (B&W `url` preserved) and the colored result also appears in the "Colored" section.

**Tech Stack:** Next.js 16 (App Router route handlers), React 19, TanStack Query, Vitest, Prisma, Diaflow image provider, Cloudflare R2.

## Global Constraints

- Source cover output is **pure black-and-white line art** — never colorized by the gen step.
- Title-safe area = **25%** of the canvas; illustration = remaining **75%** (Top/Middle/Bottom = title-safe position).
- Gen + colorize routes stay **Redis-free** (import only `prisma`/`r2`/`ai`/`langfuse`) so they run locally.
- Colorizing a source cover **must not mutate `url`** (the B&W stays).
- Source covers live in `book.data.sourceCovers[]` — never in `coloringPages` (keeps PDF/export/counts untouched).
- Vietnamese UI copy (matches existing screens).
- Test commands per package: server-core → `cd packages/server-core && yarn vitest run <file>`; admin → `cd apps/admin && yarn vitest run <file>`; coloring → `cd packages/coloring && yarn vitest run <file>`.

---

## File Structure

- **New** `packages/coloring/src/data/source-covers.ts` — `SourceCover`/`TitleSafePosition` types + pure helpers (`upsertColoredSourceCover`, `coloredSourceCovers`).
- **New** `packages/coloring/src/data/source-covers.test.ts`
- **New** `packages/server-core/src/ai/prompts/cover-source-bw-prompt-template.ts`
- **New** `packages/server-core/src/ai/prompts/cover-source-bw-prompt-template.test.ts`
- **New** `apps/admin/src/app/api/books/[bookId]/source-covers/route.ts` (POST gen, PATCH togglePublic)
- **New** `apps/admin/src/app/api/books/[bookId]/source-covers/route.test.ts`
- **New** `apps/admin/src/app/api/books/[bookId]/source-covers/[scId]/route.ts` (DELETE remove)
- **New** `packages/coloring/src/data/use-source-covers.ts`
- **New** `packages/coloring/src/screens/books/interior-picker-modal.tsx`
- **New** `packages/coloring/src/screens/books/source-cover-section.tsx`
- **Edit** `packages/server-core/src/ai/image-provider.ts` — add `generateCoverSourceBW`
- **Edit** `packages/server-core/src/ai/index.ts` + `prompts/index.ts` — export new symbols
- **Edit** `apps/admin/src/app/api/coloring-styles/colorize/route.ts` — `target:"sourceCover"` write-back
- **Edit** `packages/coloring/src/screens/books/page-actions-row.tsx` — `variant` prop
- **Edit** `packages/coloring/src/screens/books/book-detail-screen.tsx` — render section, merge Colored, wire clicks

---

## Task 1: `SourceCover` type + pure helpers

**Files:**
- Create: `packages/coloring/src/data/source-covers.ts`
- Test: `packages/coloring/src/data/source-covers.test.ts`

**Interfaces:**
- Produces:
  - `type TitleSafePosition = "top" | "middle" | "bottom"`
  - `interface SourceCover { id: string; url: string; coloredUrl?: string; isPublic?: boolean; titleSafe: TitleSafePosition; sourceInteriorId: string; coloringStyleId?: string; coloringVariantId?: string | null; createdAt: string }`
  - `function coloredSourceCovers(covers: SourceCover[]): SourceCover[]` — those with a `coloredUrl`.
  - `function upsertColoredSourceCover(covers: SourceCover[], scId: string, coloredUrl: string, styleId?: string, variantId?: string | null): SourceCover[]` — returns a new array with that cover's `coloredUrl`/style set, `url` untouched; no-op clone if `scId` absent.

- [ ] **Step 1: Write the failing test**

```ts
// packages/coloring/src/data/source-covers.test.ts
import { describe, it, expect } from "vitest";
import { coloredSourceCovers, upsertColoredSourceCover, type SourceCover } from "./source-covers";

const sc = (o: Partial<SourceCover> & { id: string }): SourceCover => ({
  url: `/sc/${o.id}.png`, titleSafe: "top", sourceInteriorId: "p1", createdAt: "2026-08-14", ...o,
});

describe("coloredSourceCovers", () => {
  it("keeps only covers that have a coloredUrl", () => {
    const list = [sc({ id: "a" }), sc({ id: "b", coloredUrl: "/c/b.png" })];
    expect(coloredSourceCovers(list).map((c) => c.id)).toEqual(["b"]);
  });
});

describe("upsertColoredSourceCover", () => {
  it("sets coloredUrl + style without mutating url or the input array", () => {
    const list = [sc({ id: "a" })];
    const next = upsertColoredSourceCover(list, "a", "/c/a.png", "style1", "v1");
    expect(next[0].coloredUrl).toBe("/c/a.png");
    expect(next[0].coloringStyleId).toBe("style1");
    expect(next[0].coloringVariantId).toBe("v1");
    expect(next[0].url).toBe("/sc/a.png");      // B&W preserved
    expect(list[0].coloredUrl).toBeUndefined(); // input not mutated
  });

  it("returns an unchanged clone when scId is absent", () => {
    const list = [sc({ id: "a" })];
    expect(upsertColoredSourceCover(list, "missing", "/c/x.png")).toEqual(list);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/coloring && yarn vitest run src/data/source-covers.test.ts`
Expected: FAIL — cannot find module `./source-covers`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/coloring/src/data/source-covers.ts
export type TitleSafePosition = "top" | "middle" | "bottom";

/** On-demand B&W cover source built from an interior page.
 *  Lives in book.data.sourceCovers[]. `url` is the B&W recompose and is NEVER
 *  replaced by colorize; `coloredUrl` holds the colored result (also surfaced in
 *  the book's "Colored" section). */
export interface SourceCover {
  id: string;
  url: string;
  coloredUrl?: string;
  isPublic?: boolean;
  titleSafe: TitleSafePosition;
  sourceInteriorId: string;
  coloringStyleId?: string;
  coloringVariantId?: string | null;
  createdAt: string;
}

export function coloredSourceCovers(covers: SourceCover[]): SourceCover[] {
  return covers.filter((c) => !!c.coloredUrl);
}

export function upsertColoredSourceCover(
  covers: SourceCover[],
  scId: string,
  coloredUrl: string,
  styleId?: string,
  variantId?: string | null,
): SourceCover[] {
  return covers.map((c) =>
    c.id === scId
      ? { ...c, coloredUrl, coloringStyleId: styleId ?? c.coloringStyleId, coloringVariantId: variantId ?? c.coloringVariantId }
      : c,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/coloring && yarn vitest run src/data/source-covers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/coloring/src/data/source-covers.ts packages/coloring/src/data/source-covers.test.ts
git commit -m "feat(source-cover): SourceCover type + pure helpers"
```

---

## Task 2: B&W recompose prompt

**Files:**
- Create: `packages/server-core/src/ai/prompts/cover-source-bw-prompt-template.ts`
- Test: `packages/server-core/src/ai/prompts/cover-source-bw-prompt-template.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `function buildCoverSourceBWPrompt(titleSafe: "top" | "middle" | "bottom"): string`

- [ ] **Step 1: Write the failing test**

```ts
// packages/server-core/src/ai/prompts/cover-source-bw-prompt-template.test.ts
import { describe, it, expect } from "vitest";
import { buildCoverSourceBWPrompt } from "./cover-source-bw-prompt-template";

describe("buildCoverSourceBWPrompt", () => {
  it("returns a non-trivial string for each position", () => {
    for (const pos of ["top", "middle", "bottom"] as const) {
      expect(buildCoverSourceBWPrompt(pos).length).toBeGreaterThan(200);
    }
  });

  it("forbids color — stays pure black-and-white line art", () => {
    const p = buildCoverSourceBWPrompt("top").toLowerCase();
    expect(p).toMatch(/black-and-white|black and white/);
    expect(p).toMatch(/line art|line-art/);
    expect(p).toMatch(/no color|do not colou?r|no colour/);
    expect(p).toMatch(/no (grayscale|gray|shading|fills?)/);
  });

  it("reserves a 25% title-safe area and 75% illustration", () => {
    const top = buildCoverSourceBWPrompt("top");
    expect(top).toMatch(/25%/);
    expect(top).toMatch(/75%/);
    expect(top.toLowerCase()).toMatch(/title-safe/);
  });

  it("puts the title-safe area at the requested edge", () => {
    expect(buildCoverSourceBWPrompt("top").toLowerCase()).toMatch(/upper 25%/);
    expect(buildCoverSourceBWPrompt("bottom").toLowerCase()).toMatch(/lower 25%/);
    expect(buildCoverSourceBWPrompt("middle").toLowerCase()).toMatch(/middle ~?25%|middle band/);
  });

  it("forbids any text and requires preserving the original line-art", () => {
    const p = buildCoverSourceBWPrompt("bottom").toLowerCase();
    expect(p).toMatch(/no text|do not draw any text|any text:/);
    expect(p).toMatch(/preserve|keep the original/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server-core && yarn vitest run src/ai/prompts/cover-source-bw-prompt-template.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/server-core/src/ai/prompts/cover-source-bw-prompt-template.ts
/**
 * B&W Cover-Source Prompt — recompose an interior coloring page into a
 * book-cover LAYOUT while staying PURE BLACK-AND-WHITE LINE ART. Reserves a
 * title-safe area (25% of the canvas) at the top / middle / bottom for a title
 * added later. Unlike buildCoverSourcePrompt, this NEVER colorizes.
 */
type TitleSafePosition = "top" | "middle" | "bottom";

function regionClauses(titleSafe: TitleSafePosition): { safe: string; art: string } {
  switch (titleSafe) {
    case "top":
      return { safe: "the UPPER 25% of the canvas", art: "the lower 75% of the canvas" };
    case "bottom":
      return { safe: "the LOWER 25% of the canvas", art: "the upper 75% of the canvas" };
    case "middle":
      return {
        safe: "a horizontal band across the MIDDLE ~25% of the canvas",
        art: "the remaining ~75% split above and below that middle band",
      };
  }
}

export function buildCoverSourceBWPrompt(titleSafe: TitleSafePosition): string {
  const { safe, art } = regionClauses(titleSafe);
  return `You are a professional coloring-book cover designer working in pure black-and-white line art.

TASK:
Recompose the FIRST provided image (a black-and-white coloring page) into a book-cover LAYOUT. Preserve the original subjects, characters, objects, concept, and line-art style. Reposition so the MAIN ILLUSTRATION occupies ${art}, and reserve ${safe} as a clean, title-safe area for a title to be added LATER.

==================================================
STAY PURE BLACK-AND-WHITE LINE ART
==================================================

- Output MUST be pure black-and-white line art: clean black outlines on a white background.
- NO color. Do not color or colour anything.
- NO grayscale, NO gray shading, NO gradients, NO filled areas, NO tonal rendering.
- Keep the exact same line weight, shape language, and stroke quality as the original drawing.

==================================================
PRESERVE THE ORIGINAL ARTWORK
==================================================

Keep the original main subject(s), characters, objects, concept, mood, and line-art style. Do NOT switch to a new scene, invent large new characters, or remove important details. The goal is to RE-COMPOSE the page into a cover layout, not to draw a new picture.

==================================================
TITLE-SAFE AREA (25%)
==================================================

Reserve ${safe} as a title-safe area for a title/subtitle to be placed LATER (do NOT draw any text now). It must be airy and open — free of the main subject, large objects, and dense detail — but NOT completely empty: scatter SPARSE, small black-and-white line-art motifs drawn from the original's own decorative elements (e.g. stars, leaves, dots, hearts, sparkles) at low density. The transition to the illustration must be natural — no hard dividing line.

==================================================
MAIN ILLUSTRATION (75%)
==================================================

Keep the main illustration in ${art}: large enough to read as a thumbnail, do not crop out the character or important objects, keep the rich detail of the source. You MAY gently reposition, rescale, or lightly outpaint the background to fit the cover layout, but everything you add must match the original's line weight and style.

==================================================
DO NOT GENERATE
==================================================

- any text: title, subtitle, author name, logo, brand, fake typography, random letters, or watermark
- any color, grayscale shading, gradients, or filled/painted areas
- a collage, grid, or multi-panel layout
- a completely empty title area, or a hard horizontal divider

==================================================
FINAL OUTPUT
==================================================

A single black-and-white line-art COVER SOURCE: the original illustration re-composed for a cover, main artwork in ${art}, a clean title-safe area in ${safe} holding only sparse on-brand line-art motifs, and NO text anywhere.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server-core && yarn vitest run src/ai/prompts/cover-source-bw-prompt-template.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server-core/src/ai/prompts/cover-source-bw-prompt-template.ts packages/server-core/src/ai/prompts/cover-source-bw-prompt-template.test.ts
git commit -m "feat(source-cover): B&W recompose prompt (title-safe top/middle/bottom)"
```

---

## Task 3: `generateCoverSourceBW` function + exports

**Files:**
- Modify: `packages/server-core/src/ai/image-provider.ts` (append after `generateCoverSource`, ~line 243)
- Modify: `packages/server-core/src/ai/prompts/index.ts` (add re-export)
- Modify: `packages/server-core/src/ai/index.ts` (add to image-provider + prompts export blocks)

**Interfaces:**
- Consumes: `buildCoverSourceBWPrompt` (Task 2), `editImage`, `ColorizeOptions`, `GeneratedImage`.
- Produces: `function generateCoverSourceBW(imageUrl: string, titleSafe: "top" | "middle" | "bottom", options?: ColorizeOptions): Promise<GeneratedImage>`

- [ ] **Step 1: Add the function to `image-provider.ts`**

Append after the `generateCoverSource` function (after line 243):

```ts
/**
 * B&W cover-source generation — recompose the interior line-art into a cover
 * LAYOUT (title-safe area at top/middle/bottom, illustration in the rest) while
 * staying pure black-and-white line art. NEVER colorizes. Uses the same
 * editImage path as generateCoverSource.
 */
export async function generateCoverSourceBW(
  imageUrl: string,
  titleSafe: "top" | "middle" | "bottom",
  options: ColorizeOptions = {},
): Promise<GeneratedImage> {
  const { buildCoverSourceBWPrompt } = await import("./prompts/cover-source-bw-prompt-template");
  const prompt = buildCoverSourceBWPrompt(titleSafe);
  return editImage(imageUrl, prompt, options);
}
```

- [ ] **Step 2: Export from `ai/index.ts`**

In the `from "./image-provider"` block (line 30-45), add `generateCoverSourceBW,` after `generateCoverSource,`.
In the `from "./prompts"` block (line 48-67), add `buildCoverSourceBWPrompt,` after `buildCoverSourcePrompt,`.

In `prompts/index.ts`, add after the `buildCoverSourcePrompt` export:

```ts
export { buildCoverSourceBWPrompt } from "./cover-source-bw-prompt-template";
```

- [ ] **Step 3: Verify it typechecks**

Run: `cd packages/server-core && yarn typecheck`
Expected: no errors.

- [ ] **Step 4: Verify the barrel resolves (smoke test)**

Run: `cd packages/server-core && yarn vitest run src/ai/prompts/cover-source-bw-prompt-template.test.ts`
Expected: PASS (unchanged) — confirms nothing broke.

- [ ] **Step 5: Commit**

```bash
git add packages/server-core/src/ai/image-provider.ts packages/server-core/src/ai/index.ts packages/server-core/src/ai/prompts/index.ts
git commit -m "feat(source-cover): generateCoverSourceBW + exports"
```

---

## Task 4: `source-covers` route — POST (gen) + PATCH (togglePublic) + DELETE

**Files:**
- Create: `apps/admin/src/app/api/books/[bookId]/source-covers/route.ts` (POST, PATCH)
- Create: `apps/admin/src/app/api/books/[bookId]/source-covers/[scId]/route.ts` (DELETE)
- Test: `apps/admin/src/app/api/books/[bookId]/source-covers/route.test.ts`

**Interfaces:**
- Consumes: `generateCoverSourceBW` (Task 3), `SourceCover`/`TitleSafePosition` (Task 1), `@vx/server-core/r2` (`getR2Config`, `createR2Client`, `uploadToR2`, `resolveR2Url`).
- Produces: `POST` → `{ success: true, sourceCover: SourceCover }`; `PATCH { scId, isPublic }` → `{ success: true }`; `DELETE` → `{ success: true }`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/admin/src/app/api/books/[bookId]/source-covers/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@vx/db", () => ({ prisma: { book: {
  findUnique: (...a: unknown[]) => findUnique(...a),
  update: (...a: unknown[]) => update(...a),
} } }));

const generateCoverSourceBW = vi.fn();
vi.mock("@vx/server-core/ai", () => ({
  generateCoverSourceBW: (...a: unknown[]) => generateCoverSourceBW(...a),
}));

vi.mock("@vx/server-core/r2", () => ({
  getR2Config: () => ({}),
  createR2Client: () => ({}),
  uploadToR2: vi.fn().mockResolvedValue({ url: "https://r2/sc.png" }),
  resolveR2Url: (k: string) => `https://r2/${k.replace(/^\//, "")}`,
}));

import { POST, PATCH } from "./route";

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/books/b1/source-covers", {
    method: "POST", body: JSON.stringify(body),
  });
const params = { params: Promise.resolve({ bookId: "b1" }) };

describe("POST /api/books/[bookId]/source-covers", () => {
  beforeEach(() => {
    findUnique.mockReset(); update.mockReset(); generateCoverSourceBW.mockReset();
    generateCoverSourceBW.mockResolvedValue({ base64: "AAA", dataUrl: "data:image/png;base64,AAA" });
    update.mockResolvedValue({});
  });

  it("404 when the interior page is not in the book", async () => {
    findUnique.mockResolvedValue({ id: "b1", coloringPages: [{ id: "other", url: "/p.png" }], data: {} });
    const res = await POST(req({ interiorPageId: "nope", titleSafe: "top" }), params);
    expect(res.status).toBe(404);
    expect(generateCoverSourceBW).not.toHaveBeenCalled();
  });

  it("generates a B&W source cover and appends it to book.data.sourceCovers", async () => {
    findUnique.mockResolvedValue({ id: "b1", coloringPages: [{ id: "p1", url: "/p1.png" }], data: {} });
    const res = await POST(req({ interiorPageId: "p1", titleSafe: "bottom" }), params);
    expect(res.status).toBe(200);
    // called with the resolved interior url + the requested title-safe position
    expect(generateCoverSourceBW).toHaveBeenCalledWith("https://r2/p1.png", "bottom", expect.any(Object));
    const saved = update.mock.calls[0][0].data.data.sourceCovers;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ titleSafe: "bottom", sourceInteriorId: "p1", url: "https://r2/sc.png" });
    const json = await res.json();
    expect(json.sourceCover.titleSafe).toBe("bottom");
  });
});

describe("PATCH /api/books/[bookId]/source-covers", () => {
  beforeEach(() => { findUnique.mockReset(); update.mockReset(); update.mockResolvedValue({}); });
  it("toggles isPublic on the target source cover", async () => {
    findUnique.mockResolvedValue({ id: "b1", data: { sourceCovers: [{ id: "s1", url: "/s.png", isPublic: false }] } });
    const patchReq = new NextRequest("http://localhost/api/books/b1/source-covers", {
      method: "PATCH", body: JSON.stringify({ scId: "s1", isPublic: true }),
    });
    const res = await PATCH(patchReq, params);
    expect(res.status).toBe(200);
    expect(update.mock.calls[0][0].data.data.sourceCovers[0].isPublic).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && yarn vitest run src/app/api/books/[bookId]/source-covers/route.test.ts`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 3: Write the route (POST + PATCH)**

```ts
// apps/admin/src/app/api/books/[bookId]/source-covers/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@vx/db";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import { generateCoverSourceBW } from "@vx/server-core/ai";
import type { SourceCover, TitleSafePosition } from "@vx/coloring/data/source-covers";

// Diaflow recompose runs inline; allow a long budget.
export const maxDuration = 300;

type RouteParams = { params: Promise<{ bookId: string }> };
type Page = { id?: string; url?: string };

/** POST — convert one interior page into a B&W source cover (synchronous). */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId } = await params;
    const { interiorPageId, titleSafe } = (await req.json().catch(() => ({}))) as {
      interiorPageId?: string; titleSafe?: TitleSafePosition;
    };
    if (!interiorPageId || !titleSafe)
      return NextResponse.json({ error: "interiorPageId and titleSafe are required" }, { status: 400 });

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

    const pages = (book.coloringPages as Page[] | null) ?? [];
    const interior = pages.find((p) => p.id === interiorPageId);
    if (!interior?.url)
      return NextResponse.json({ error: "Interior page not found" }, { status: 404 });

    const img = await generateCoverSourceBW(resolveR2Url(interior.url), titleSafe, {
      trace: { caller: "books/source-covers" },
    });

    const scId = crypto.randomUUID();
    const r2Config = getR2Config();
    const buffer = Buffer.from(img.dataUrl.split(",")[1], "base64");
    const { url } = await uploadToR2({
      client: createR2Client(r2Config), config: r2Config,
      key: `assets/${bookId}/source-covers/${scId}.png`, body: buffer, contentType: "image/png",
    });

    const sourceCover: SourceCover = {
      id: scId, url, isPublic: false, titleSafe,
      sourceInteriorId: interiorPageId, createdAt: new Date().toISOString(),
    };
    const data = (book.data as Record<string, unknown> | null) ?? {};
    const sourceCovers = [ ...((data.sourceCovers as SourceCover[] | undefined) ?? []), sourceCover ];
    await prisma.book.update({ where: { id: bookId }, data: { data: { ...data, sourceCovers } as never } });

    return NextResponse.json({ success: true, sourceCover });
  } catch (error) {
    console.error("[books/source-covers POST] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

/** PATCH — toggle isPublic on one source cover. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId } = await params;
    const { scId, isPublic } = (await req.json().catch(() => ({}))) as { scId?: string; isPublic?: boolean };
    if (!scId) return NextResponse.json({ error: "scId required" }, { status: 400 });

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

    const data = (book.data as Record<string, unknown> | null) ?? {};
    const sourceCovers = ((data.sourceCovers as SourceCover[] | undefined) ?? []).map((c) =>
      c.id === scId ? { ...c, isPublic: isPublic ?? !c.isPublic } : c,
    );
    await prisma.book.update({ where: { id: bookId }, data: { data: { ...data, sourceCovers } as never } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[books/source-covers PATCH] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
```

- [ ] **Step 4: Write the DELETE sub-route**

```ts
// apps/admin/src/app/api/books/[bookId]/source-covers/[scId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import type { SourceCover } from "@vx/coloring/data/source-covers";

type RouteParams = { params: Promise<{ bookId: string; scId: string }> };

/** DELETE — remove one source cover from book.data.sourceCovers. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId, scId } = await params;
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

    const data = (book.data as Record<string, unknown> | null) ?? {};
    const sourceCovers = ((data.sourceCovers as SourceCover[] | undefined) ?? []).filter((c) => c.id !== scId);
    await prisma.book.update({ where: { id: bookId }, data: { data: { ...data, sourceCovers } as never } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[books/source-covers DELETE] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/admin && yarn vitest run src/app/api/books/[bookId]/source-covers/route.test.ts`
Expected: PASS (3 tests). Then `cd apps/admin && yarn typecheck` → no errors.

- [ ] **Step 6: Commit**

```bash
git add "apps/admin/src/app/api/books/[bookId]/source-covers"
git commit -m "feat(source-cover): synchronous gen route (POST) + togglePublic/delete"
```

---

## Task 5: Colorize write-back for source covers

**Files:**
- Modify: `apps/admin/src/app/api/coloring-styles/colorize/route.ts`
- Test: add cases to a new `apps/admin/src/app/api/coloring-styles/colorize/route.test.ts`

**Interfaces:**
- Consumes: existing colorize route; `upsertColoredSourceCover` (Task 1).
- Produces: colorize accepts optional body `target?: "page" | "sourceCover"` (default `"page"`). When `"sourceCover"` with `bookId`+`pageId`, writes `coloredUrl` into `book.data.sourceCovers[pageId]` and uploads under `assets/{bookId}/source-covers/{pageId}-colored.png`; `coloringPages` untouched.

- [ ] **Step 1: Write the failing test**

```ts
// apps/admin/src/app/api/coloring-styles/colorize/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@vx/db", () => ({ prisma: {
  coloringStyle: { findUnique: vi.fn().mockResolvedValue({ id: "st1", colorizationDirective: "warm", referenceImages: [], variants: [] }) },
  book: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) },
} }));
vi.mock("@vx/server-core/ai/image-provider", () => ({
  colorizeImage: vi.fn().mockResolvedValue({ base64: "AAA", dataUrl: "data:image/png;base64,AAA" }),
}));
vi.mock("@vx/server-core/langfuse", () => ({ flushLangfuse: vi.fn() }));
vi.mock("@vx/server-core/r2", () => ({
  getR2Config: () => ({}), createR2Client: () => ({}),
  uploadToR2: vi.fn().mockResolvedValue({ url: "https://r2/colored.png" }),
  resolveR2Url: (k: string) => `https://r2/${k.replace(/^\//, "")}`,
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/coloring-styles/colorize", { method: "POST", body: JSON.stringify(body) }));

describe("colorize target:sourceCover", () => {
  beforeEach(() => { findUnique.mockReset(); update.mockReset(); update.mockResolvedValue({}); });

  it("writes coloredUrl into book.data.sourceCovers, leaving url + coloringPages untouched", async () => {
    findUnique.mockResolvedValue({
      id: "b1", coloringPages: [{ id: "p1", url: "/p1.png" }],
      data: { sourceCovers: [{ id: "sc1", url: "/sc1.png", titleSafe: "top", sourceInteriorId: "p1", createdAt: "x" }] },
    });
    const res = await post({ imageUrl: "/sc1.png", coloringStyleId: "st1", bookId: "b1", pageId: "sc1", target: "sourceCover" });
    expect(res.status).toBe(200);
    const savedData = update.mock.calls[0][0].data;
    expect(savedData.coloringPages).toBeUndefined(); // did not touch coloringPages
    const sc = savedData.data.sourceCovers[0];
    expect(sc.coloredUrl).toContain("https://r2/colored.png");
    expect(sc.url).toBe("/sc1.png"); // B&W preserved
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && yarn vitest run src/app/api/coloring-styles/colorize/route.test.ts`
Expected: FAIL — target branch not implemented (writes to coloringPages / warns).

- [ ] **Step 3: Implement the branch**

In `colorize/route.ts`, add `target` to the destructured body (default `"page"`):

```ts
const { imageUrl, coloringStyleId, coloringVariantId, bookId, pageId, useReference = true, target = "page" } = body as {
  imageUrl: string; coloringStyleId: string; coloringVariantId?: string;
  bookId?: string; pageId?: string; useReference?: boolean; target?: "page" | "sourceCover";
};
```

Change the upload key to branch on `target`:

```ts
let key: string;
if (bookId && pageId) {
  key = target === "sourceCover"
    ? `assets/${bookId}/source-covers/${pageId}-colored.png`
    : `assets/${bookId}/pages/${pageId}-colored.png`;
} else {
  key = `assets/coloring-styles/${coloringStyleId}/test-${Date.now()}.png`;
}
```

Then, replace the `if (bookId && pageId) { … coloringPages … }` write-back block so `target:"sourceCover"` updates `book.data.sourceCovers` instead. At the top of `colorize/route.ts` add:

```ts
import { upsertColoredSourceCover, type SourceCover } from "@vx/coloring/data/source-covers";
```

And branch the write-back:

```ts
if (bookId && pageId) {
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (book) {
    const coloredUrlWithBust = `${coloredUrl}?v=${Date.now()}`;
    if (target === "sourceCover") {
      const data = (book.data as Record<string, unknown> | null) ?? {};
      const sourceCovers = upsertColoredSourceCover(
        (data.sourceCovers as SourceCover[] | undefined) ?? [],
        pageId, coloredUrlWithBust, coloringStyleId, coloringVariantId ?? null,
      );
      await prisma.book.update({ where: { id: bookId }, data: { data: { ...data, sourceCovers } as never } });
    } else {
      // … existing coloringPages migration + findIndex write-back (unchanged) …
    }
  }
}
```

(Keep the existing coloringPages branch verbatim inside the `else`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/admin && yarn vitest run src/app/api/coloring-styles/colorize/route.test.ts`
Expected: PASS. Then `cd apps/admin && yarn typecheck` → no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/api/coloring-styles/colorize/route.ts apps/admin/src/app/api/coloring-styles/colorize/route.test.ts
git commit -m "feat(source-cover): colorize write-back target=sourceCover (B&W url preserved)"
```

---

## Task 6: `use-source-covers` hook

**Files:**
- Create: `packages/coloring/src/data/use-source-covers.ts`

**Interfaces:**
- Consumes: `SourceCover`/`TitleSafePosition` (Task 1); `COLORING_API_BASE`, `COLORING_WRITE_ENABLED` from `./config`; `httpPost`, `httpPatch`, `httpDel` from `@vx/core-uikit/api`.
- Produces:
  ```ts
  function useSourceCovers(bookId: string): {
    enabled: boolean;
    gen(interiorPageId: string, titleSafe: TitleSafePosition): Promise<void>;
    colorize(sc: SourceCover, styleId: string, variantId?: string | null): Promise<void>;
    togglePublic(scId: string): Promise<void>;
    remove(scId: string): Promise<void>;
  }
  ```

- [ ] **Step 1: Write the hook**

```ts
// packages/coloring/src/data/use-source-covers.ts
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost, httpPatch, httpDel } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";
import type { SourceCover, TitleSafePosition } from "./source-covers";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

/** On-demand B&W source-cover actions (gen / colorize / public / delete). */
export function useSourceCovers(bookId: string) {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
  const base = `${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}/source-covers`;
  const guard = () => { if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY); };

  return {
    enabled: COLORING_WRITE_ENABLED,
    gen: async (interiorPageId: string, titleSafe: TitleSafePosition) => {
      guard();
      await httpPost(base, { interiorPageId, titleSafe });
      inval();
    },
    colorize: async (sc: SourceCover, styleId: string, variantId?: string | null) => {
      guard();
      await httpPost(`${COLORING_API_BASE}/coloring-styles/colorize`, {
        imageUrl: sc.url, coloringStyleId: styleId, coloringVariantId: variantId ?? undefined,
        bookId, pageId: sc.id, target: "sourceCover",
      });
      inval();
    },
    togglePublic: async (scId: string) => {
      guard();
      await httpPatch(base, { scId });
      inval();
    },
    remove: async (scId: string) => {
      guard();
      await httpDel(`${base}/${encodeURIComponent(scId)}`);
      inval();
    },
  };
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `cd packages/coloring && yarn typecheck`
Expected: no errors (confirms `httpPatch`/`httpDel` signatures + config imports resolve).

- [ ] **Step 3: Commit**

```bash
git add packages/coloring/src/data/use-source-covers.ts
git commit -m "feat(source-cover): useSourceCovers hook (gen/colorize/public/delete)"
```

---

## Task 7: `PageActionsRow` source-cover mode

**Files:**
- Modify: `packages/coloring/src/screens/books/page-actions-row.tsx`

**Interfaces:**
- Consumes: `useSourceCovers` (Task 6), `SourceCover` (Task 1).
- Produces: `PageActionsRow` accepts new optional props:
  - `variant?: "page" | "sourceCover"` (default `"page"`)
  - `sourceCover?: SourceCover` (required when `variant === "sourceCover"`)
  - When `sourceCover`: hide Regen + Đổi góc; **Tô màu** calls `useSourceCovers().colorize(sourceCover, styleId, variantId)`; **Xóa** calls `useSourceCovers().remove(sourceCover.id)`; **Công khai/Ẩn** calls `useSourceCovers().togglePublic(sourceCover.id)`. Push to Cover / Set thumbnail / Set square unchanged (operate on `page.coloredUrl`).

- [ ] **Step 1: Add props + wire source-cover actions**

Extend the props type (after line 32) and body:

```tsx
export function PageActionsRow({
  bookId, pages, page, bookData, onRemoved,
  variant = "page",
  sourceCover,
}: {
  bookId: string;
  pages: BookColoringPage[];
  page: BookColoringPage;
  bookData?: Record<string, unknown>;
  onRemoved: () => void;
  variant?: "page" | "sourceCover";
  sourceCover?: import("../../data/source-covers").SourceCover;
}) {
```

Add near the other hooks (after `const coverCandidates = useCoverCandidates(bookId);`):

```tsx
const sourceCovers = useSourceCovers(bookId);
const isSC = variant === "sourceCover" && !!sourceCover;
```

with the import at the top:

```tsx
import { useSourceCovers } from "../../data/use-source-covers";
```

Change the **Tô màu** button's onClick to branch:

```tsx
onClick={run("colorize", () =>
  isSC
    ? sourceCovers.colorize(sourceCover!, sel!.styleId, sel!.variantId)
    : actions.colorize(page.id, page.url, sel!.styleId, sel!.variantId),
)}
```

Wrap the Regen / Đổi góc block so it's hidden for source covers — change `{actions.canRegen && (` to:

```tsx
{!isSC && actions.canRegen && (
```

Change the **Công khai/Ẩn** button onClick:

```tsx
onClick={run("pub", () => isSC ? sourceCovers.togglePublic(sourceCover!.id) : actions.togglePublic(pages, page.id))}
```

Change the **Xóa** button onClick:

```tsx
onClick={run("del", () => isSC ? sourceCovers.remove(sourceCover!.id) : actions.removePage(pages, page.id), onRemoved)}
```

Also hide the "Regen Thêm" variants button for source covers — change its wrapper/`disabled` by adding `{!isSC && (` around the `Regen Thêm` button (lines 138-141) and the variants panel (lines 190-218) since variants are clone-job-backed too.

- [ ] **Step 2: Verify it typechecks**

Run: `cd packages/coloring && yarn typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/coloring/src/screens/books/page-actions-row.tsx
git commit -m "feat(source-cover): PageActionsRow variant=sourceCover (hide regen, route colorize to sourceCovers)"
```

---

## Task 8: Source Cover section + interior-picker dialog + Colored merge

**Files:**
- Create: `packages/coloring/src/screens/books/interior-picker-modal.tsx`
- Create: `packages/coloring/src/screens/books/source-cover-section.tsx`
- Modify: `packages/coloring/src/screens/books/book-detail-screen.tsx`

**Interfaces:**
- Consumes: `useSourceCovers` (Task 6), `SourceCover` (Task 1), `PageActionsRow` variant (Task 7), existing `PageThumb`, `PageSection`, `PreviewModal`, `Card`, `Button`, `Icon`, `resolveImg`.
- Produces:
  - `InteriorPickerModal` — modal grid of interior thumbnails; `onPick(interiorPageId)`.
  - `SourceCoverSection` — the Card with 3 Gen buttons, the interior picker, and source-cover thumbnails; `onOpenSourceCover(sc)` callback.

- [ ] **Step 1: Interior picker modal**

```tsx
// packages/coloring/src/screens/books/interior-picker-modal.tsx
"use client";

import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { resolveImg } from "../../data/img";
import type { BookColoringPage } from "../../data/types";

export function InteriorPickerModal({
  open, title, pages, busy, onPick, onClose,
}: {
  open: boolean;
  title: string;
  pages: BookColoringPage[];
  busy: boolean;
  onPick: (interiorPageId: string) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div onClick={busy ? undefined : onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,13,12,.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", padding: 20, width: "min(880px, 94vw)", maxHeight: "86vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" style={{ background: "none", border: "none", cursor: busy ? "default" : "pointer" }}><Icon name="x" size={18} /></button>
        </div>
        {busy && <div style={{ marginBottom: 12, fontSize: 13, color: "var(--muted-foreground)" }}><Icon name="loader" size={14} /> Đang tạo bìa… (~2 phút, đừng đóng)</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 10, opacity: busy ? 0.5 : 1, pointerEvents: busy ? "none" : "auto" }}>
          {pages.map((p, i) => (
            <button key={p.id || i} type="button" onClick={() => onPick(p.id)} style={{ padding: 0, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden", cursor: "pointer", background: "#fff", aspectRatio: "1 / 1" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolveImg(p.url)} alt={`Trang ${i + 1}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </button>
          ))}
        </div>
        <div style={{ marginTop: 14, textAlign: "right" }}>
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>Đóng</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Source Cover section**

```tsx
// packages/coloring/src/screens/books/source-cover-section.tsx
"use client";

import { useState } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Icon } from "../../lib/icon";
import { resolveImg } from "../../data/img";
import { useSourceCovers } from "../../data/use-source-covers";
import type { SourceCover, TitleSafePosition } from "../../data/source-covers";
import type { BookColoringPage } from "../../data/types";
import { InteriorPickerModal } from "./interior-picker-modal";

const LABEL: Record<TitleSafePosition, string> = { top: "Top", middle: "Middle", bottom: "Bottom" };

export function SourceCoverSection({
  bookId, interiors, sourceCovers, onOpen,
}: {
  bookId: string;
  interiors: BookColoringPage[];
  sourceCovers: SourceCover[];
  onOpen: (sc: SourceCover) => void;
}) {
  const sc = useSourceCovers(bookId);
  const [pickFor, setPickFor] = useState<TitleSafePosition | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const doGen = async (interiorPageId: string) => {
    if (!pickFor) return;
    setBusy(true); setErr(null);
    try { await sc.gen(interiorPageId, pickFor); setPickFor(null); }
    catch (e) { setErr(e instanceof Error ? e.message : "Tạo source cover thất bại"); }
    finally { setBusy(false); }
  };

  return (
    <Card title={`Source Cover · ${sourceCovers.length}`}
      actions={
        <div style={{ display: "flex", gap: 6 }}>
          {(["top", "middle", "bottom"] as const).map((pos) => (
            <Button key={pos} size="sm" variant="outline" disabled={!sc.enabled || interiors.length === 0}
              onClick={() => { setErr(null); setPickFor(pos); }}>
              <Icon name="image" size={14} /> Gen Cover ({LABEL[pos]})
            </Button>
          ))}
        </div>
      }
    >
      {err && <div style={{ marginBottom: 10, padding: "8px 10px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12 }}>{err}</div>}
      {sourceCovers.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Chưa có source cover. Bấm một nút Gen Cover để tạo từ 1 trang interior.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 10 }}>
          {sourceCovers.map((s) => (
            <div key={s.id} onClick={() => onOpen(s)} style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid var(--border)", background: "#fff", cursor: "pointer" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolveImg(s.url)} alt="source cover" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <span style={{ position: "absolute", left: 4, top: 4, fontSize: 9, fontWeight: 700, color: "#fff", background: "rgba(11,13,12,.6)", padding: "1px 5px", borderRadius: 4 }}>{LABEL[s.titleSafe]}</span>
            </div>
          ))}
        </div>
      )}
      <InteriorPickerModal
        open={pickFor !== null}
        title={`Chọn interior để tạo Source Cover (${pickFor ? LABEL[pickFor] : ""})`}
        pages={interiors} busy={busy} onPick={doGen} onClose={() => setPickFor(null)}
      />
    </Card>
  );
}
```

> **Note:** if `Card` does not accept an `actions` prop, place the 3 buttons in a header `<div>` inside the card body instead. Check `packages/coloring/src/components/ui/card.tsx` before implementing and adapt.

- [ ] **Step 3: Wire into `book-detail-screen.tsx`**

Add imports near the other screen imports:

```tsx
import { SourceCoverSection } from "./source-cover-section";
import type { SourceCover } from "../../data/source-covers";
```

Read source covers next to `coverCandidates` (~line 205):

```tsx
const sourceCovers = (b.data?.sourceCovers ?? []) as SourceCover[];
```

Add a source-cover preview opener (near `openPageAt`, ~line 247). It opens the shared `PreviewModal` with a `SourceCover`-backed `PageActionsRow`:

```tsx
const openSourceCover = (s: SourceCover) => {
  const bw = resolveImg(s.url);
  const colored = resolveImg(s.coloredUrl);
  setPreviewPage(null);
  setPreviewIdx(null);
  setPreview({
    title: "Source Cover",
    imageSrc: colored || bw,
    imageNode: colored && bw ? <ImageComparison beforeSrc={bw} afterSrc={colored} /> : undefined,
    badges: <Badge tone={s.coloredUrl ? "success" : "neutral"}>{s.coloredUrl ? "Đã tô màu" : "B&W"}</Badge>,
    actions: (
      <PageActionsRow
        bookId={bookId}
        pages={pages}
        page={{ id: s.id, url: s.url, coloredUrl: s.coloredUrl, isPublic: s.isPublic } as BookColoringPage}
        bookData={(b.data ?? undefined) as Record<string, unknown> | undefined}
        onRemoved={closePreview}
        variant="sourceCover"
        sourceCover={s}
      />
    ),
  });
};
```

(`PageActionsRow` and `Badge` are already imported in this file; `ImageComparison` is used by `openPageAt` — reuse the same import.)

Render the section in the `tab === "pages"` branch, right after `{coverCard}` (line 456):

```tsx
{coverCard}
<SourceCoverSection bookId={bookId} interiors={pages} sourceCovers={sourceCovers} onOpen={openSourceCover} />
```

Merge colored source covers into the **Colored** section. The Colored section currently maps `coloredPages` (from `coloringPages`). Add, right after the existing Colored `PageSection` block (after line 476), a second render of colored source covers using the same `PageThumb`/`PageSection` tone `"colored"`:

```tsx
{sourceCovers.some((s) => s.coloredUrl) && (
  <PageSection tone="colored" count={sourceCovers.filter((s) => s.coloredUrl).length}>
    {sourceCovers.filter((s) => s.coloredUrl).map((s) => (
      <PageThumb
        key={`sc-${s.id}`}
        page={{ id: s.id, url: s.url, coloredUrl: s.coloredUrl, isPublic: s.isPublic } as BookColoringPage}
        displayNumber="SC"
        tone="colored"
        onClick={() => openSourceCover(s)}
      />
    ))}
  </PageSection>
)}
```

- [ ] **Step 4: Verify it typechecks + builds**

Run: `cd packages/coloring && yarn typecheck`
Expected: no errors.
Run: `cd apps/admin && yarn typecheck`
Expected: no errors (the screen is consumed by the admin app).

- [ ] **Step 5: Manual verification (local, over the SSH tunnel)**

1. Ensure the tunnel + `yarn dev --filter=@vx/admin` are up, and `NEXT_PUBLIC_COLORING_WRITE=1` is set.
2. Open a book with interiors → "Trang sách" tab → the **Source Cover** section appears below Cover.
3. Click **Gen Cover (Top)** → pick an interior → wait ~2 min → a B&W source-cover thumbnail appears with a "Top" badge, and the layout reserves the top 25%.
4. Click the source cover → **Tô màu** with a style → the B&W stays in Source Cover, and a colored entry appears in the **Colored** section.
5. Verify **Push to Cover** works from the colored source cover; verify **Regen/Đổi góc** are hidden.
6. Repeat for **Middle** and **Bottom**; verify the title-safe band position changes.

- [ ] **Step 6: Commit**

```bash
git add packages/coloring/src/screens/books/interior-picker-modal.tsx packages/coloring/src/screens/books/source-cover-section.tsx packages/coloring/src/screens/books/book-detail-screen.tsx
git commit -m "feat(source-cover): Source Cover section + interior picker + Colored merge"
```

---

## Self-Review

**Spec coverage:**
- Prompt (B&W, 25% title-safe, T/M/B) → Task 2 ✓
- `generateCoverSourceBW` → Task 3 ✓
- Synchronous Redis-free gen route → Task 4 ✓
- Colorize write-back keeping B&W → Task 5 ✓
- Separate `sourceCovers[]` storage → Task 1 + Task 4 ✓
- Hide Regen/Đổi góc; keep Tô màu/Push-to-Cover/thumbnails/public/delete → Task 7 ✓
- Source Cover section + 3 Gen buttons + interior picker → Task 8 ✓
- Colorized source cover also appears in Colored; B&W stays → Task 5 (write-back) + Task 8 (Colored merge) ✓
- Local testability → gen + colorize routes import no queue (Tasks 4, 5); manual step in Task 8 ✓

**Placeholder scan:** none — all steps carry real code/commands. The only conditional is the `Card` `actions`-prop note in Task 8 (with a concrete fallback).

**Type consistency:** `SourceCover`/`TitleSafePosition` defined once in `source-covers.ts` (Task 1) and imported by the route (Task 4), colorize (Task 5), hook (Task 6), PageActionsRow (Task 7), and screen (Task 8). `generateCoverSourceBW(imageUrl, titleSafe, options)` signature identical across Tasks 3 and 4. Hook method names (`gen`/`colorize`/`togglePublic`/`remove`) match their uses in Tasks 7 and 8.

## Out of scope (YAGNI)

No auto-colorize; no change to the pipeline `generate-cover` step or `buildCoverSourcePrompt`; no PDF/export/count changes; no Regen/Đổi góc for source covers.
