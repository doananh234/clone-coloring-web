# Book Export ZIP — Background Job + Cached Download Link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the synchronous `GET /export-zip` stream with a background job that builds the book's export ZIP once, uploads it to R2, and returns a stable public download link cached on the book.

**Architecture:** A prisma-free builder module in `@vx/server-core` produces a folder plan + content hash and (separately) the zip buffer. A new `book-export` GenerationJob type runs the build in the existing BullMQ worker, uploads to R2, and writes `book.data.export = { url, hash, builtAt, filename }`. The book detail screen shows a cached link + Copy button; the enqueue route returns the cached link instantly when the content hash is unchanged.

**Tech Stack:** TypeScript, Next.js (admin API routes), BullMQ worker, Prisma, Cloudflare R2 (S3 SDK), JSZip, Vitest, React + TanStack Query.

## Global Constraints

- **Reuse existing infra, no schema migration.** `GenerationJob` `type`/`status` are plain strings; add the value `"book-export"`. Store the cached link in `Book.data.export` (JSON) — no new columns.
- **server-core stays prisma-free.** The builder receives plain data objects; callers (route + worker) read Prisma and construct the input.
- **R2 uploads store a RELATIVE path** (`/assets/...`); the CDN host is resolved at read time (`resolveR2Url` server, `resolveImg` client). Never store a full URL.
- **Redis guard:** wrap every enqueue in `withQueueTimeout(...)` and return `queueUnavailableResponse(...)` on timeout (existing pattern).
- **Copy the FULL resolved URL**, never the relative `/assets/...` path.
- **ZIP folder layout is unchanged** from the current route (Main book / Clone book folders, `page-00N.<ext>` naming).
- Vietnamese UI copy (matches surrounding screens).

---

### Task 1: Shared ZIP builder module (`@vx/server-core/book-export`)

**Files:**
- Create: `packages/server-core/src/book-export/build-export-zip.ts`
- Create: `packages/server-core/src/book-export/build-export-zip.test.ts`
- Modify: `packages/server-core/package.json` (add `jszip` dep + `./book-export` export)

**Interfaces:**
- Produces (consumed by Tasks 2 & 3):
  ```ts
  type ExportPageLike = { url?: string; coloredUrl?: string; imageUrl?: string; pageType?: string; excluded?: boolean };
  interface ExportInput {
    bookTitle: string;
    bookData: Record<string, unknown> | null; // carries coverCandidates, sourceCovers
    coverUrl?: string | null;
    summaryPages: ExportPageLike[];
    coloringPages: ExportPageLike[];
    cloneJobPages: ExportPageLike[] | null;    // source CloneJob.pages (imageUrl), or null
    cloneJobId?: string;
  }
  interface ExportEntry { url: string; name: string }
  interface ExportFolder { path: string; entries: ExportEntry[] }
  interface ExportPlan { folders: ExportFolder[]; hash: string; filename: string }
  function collectExportPlan(input: ExportInput): ExportPlan;
  function buildExportZip(plan: ExportPlan): Promise<Buffer>;
  ```

- [ ] **Step 1: Add `jszip` dependency + subpath export to server-core**

Edit `packages/server-core/package.json` — add to `"exports"` (after the `"./r2"` line):
```json
    "./r2": "./src/r2.ts",
    "./book-export": "./src/book-export/build-export-zip.ts",
```
Add to `"dependencies"`:
```json
  "dependencies": {
    "@aws-sdk/client-s3": "^3.1045.0",
    "@aws-sdk/s3-request-presigner": "^3.1053.0",
    "ioredis": "^5.4.0",
    "jszip": "^3.10.1",
    "langfuse": "^3.38.20"
  },
```

- [ ] **Step 2: Install so the workspace resolves `jszip` in server-core**

Run: `yarn install`
Expected: completes; `jszip` resolvable from `packages/server-core`.

- [ ] **Step 3: Write the failing test**

Create `packages/server-core/src/book-export/build-export-zip.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { collectExportPlan, buildExportZip, type ExportInput } from "./build-export-zip";

const baseInput: ExportInput = {
  bookTitle: "Cute Farm",
  bookData: {
    coverCandidates: [{ url: "/assets/b/cc-1.png" }, { url: "/assets/b/cc-2.png" }],
    sourceCovers: [{ url: "/assets/b/sc-1.png", coloredUrl: "/assets/b/sc-1-c.png" }],
  },
  coverUrl: "/assets/b/cover.png",
  summaryPages: [{ url: "/assets/b/intro-1.png" }],
  coloringPages: [
    { url: "/assets/b/int-1.png", coloredUrl: "/assets/b/int-1-c.png" },
    { url: "/assets/b/int-2.png" },
  ],
  cloneJobPages: [
    { imageUrl: "/assets/src/p1.png", pageType: "cover" },
    { imageUrl: "/assets/src/p2.png", pageType: "interiorIntro" },
    { imageUrl: "/assets/src/p3.png", pageType: "interior" },
    { imageUrl: "/assets/src/p4.png", excluded: true },
  ],
  cloneJobId: "job-1",
};

describe("collectExportPlan", () => {
  it("lays out Main book + Clone book folders with expected entry counts", () => {
    const plan = collectExportPlan(baseInput);
    const byPath = Object.fromEntries(plan.folders.map((f) => [f.path, f.entries]));

    expect(byPath["Main book/Book cover"].map((e) => e.url)).toEqual(["/assets/src/p1.png"]);
    expect(byPath["Main book/Book intro"].map((e) => e.url)).toEqual(["/assets/src/p2.png"]);
    // interior excludes the cover, the intro, and the excluded page
    expect(byPath["Main book/Book interior"].map((e) => e.url)).toEqual(["/assets/src/p3.png"]);

    expect(byPath["Clone book/Book cover"].map((e) => e.name)).toEqual(["cover-01", "cover-02"]);
    expect(byPath["Clone book/Book intro"].map((e) => e.url)).toEqual(["/assets/b/intro-1.png"]);
    expect(byPath["Clone book/Book interior"].map((e) => e.name)).toEqual(["page-001", "page-002"]);
    expect(byPath["Clone book/Book colored"].map((e) => e.url)).toEqual(["/assets/b/int-1-c.png"]);
    expect(byPath["Clone book/Source cover"].map((e) => e.url)).toEqual(["/assets/b/sc-1.png"]);
    expect(byPath["Clone book/Source cover colored"].map((e) => e.url)).toEqual(["/assets/b/sc-1-c.png"]);

    expect(plan.filename).toBe(`cute-farm-${plan.hash}.zip`);
  });

  it("falls back to the first source page as cover when none is classified", () => {
    const plan = collectExportPlan({
      ...baseInput,
      cloneJobPages: [{ imageUrl: "/assets/src/a.png" }, { imageUrl: "/assets/src/b.png" }],
    });
    const cover = plan.folders.find((f) => f.path === "Main book/Book cover")!;
    expect(cover.entries.map((e) => e.url)).toEqual(["/assets/src/a.png"]);
  });

  it("omits Main book folders when there is no source clone job", () => {
    const plan = collectExportPlan({ ...baseInput, cloneJobPages: null, cloneJobId: undefined });
    expect(plan.folders.some((f) => f.path.startsWith("Main book/"))).toBe(false);
  });

  it("hash is stable for identical input and changes when any url changes", () => {
    const a = collectExportPlan(baseInput).hash;
    const b = collectExportPlan(structuredClone(baseInput)).hash;
    expect(a).toBe(b);
    const changed = collectExportPlan({
      ...baseInput,
      coloringPages: [{ url: "/assets/b/CHANGED.png" }],
    }).hash;
    expect(changed).not.toBe(a);
  });
});

describe("buildExportZip", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("adds fetchable images and skips failed ones", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("int-2")) return { ok: false, status: 404 } as unknown as Response;
        return { ok: true, arrayBuffer: async () => png.buffer } as unknown as Response;
      }),
    );

    const plan = collectExportPlan({
      ...baseInput,
      bookData: {},
      coverUrl: null,
      summaryPages: [],
      cloneJobPages: null,
      cloneJobId: undefined,
      coloringPages: [{ url: "/assets/b/int-1.png" }, { url: "/assets/b/int-2.png" }],
    });
    const buf = await buildExportZip(plan);
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file("Clone book/Book interior/page-001.png")).not.toBeNull();
    expect(zip.file("Clone book/Book interior/page-002.png")).toBeNull(); // 404 skipped
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd packages/server-core && yarn test build-export-zip`
Expected: FAIL — cannot resolve `./build-export-zip` (module not created yet).

- [ ] **Step 5: Write the implementation**

Create `packages/server-core/src/book-export/build-export-zip.ts`:
```ts
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { resolveR2Url } from "../r2";

export type ExportPageLike = {
  url?: string;
  coloredUrl?: string;
  imageUrl?: string;
  pageType?: string;
  excluded?: boolean;
};

export interface ExportInput {
  bookTitle: string;
  bookData: Record<string, unknown> | null;
  coverUrl?: string | null;
  summaryPages: ExportPageLike[];
  coloringPages: ExportPageLike[];
  cloneJobPages: ExportPageLike[] | null;
  cloneJobId?: string;
}

export interface ExportEntry { url: string; name: string }
export interface ExportFolder { path: string; entries: ExportEntry[] }
export interface ExportPlan { folders: ExportFolder[]; hash: string; filename: string }

function slug(s: string): string {
  return (
    (s || "book").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) ||
    "book"
  );
}

const pad = (i: number) => `page-${String(i + 1).padStart(3, "0")}`;
const pad2 = (i: number) => String(i + 1).padStart(2, "0");

function toEntries(arr: ExportPageLike[], key: "imageUrl" | "url" | "coloredUrl"): ExportEntry[] {
  return arr.map((p, i) => ({ url: p[key] || "", name: pad(i) })).filter((e) => e.url);
}

/**
 * Build the folder/entry plan for a book export and a content hash over every
 * input image URL (+ cloneJobId). No network I/O — pure data. Folder layout is
 * identical to the legacy synchronous export route.
 */
export function collectExportPlan(input: ExportInput): ExportPlan {
  const data = input.bookData ?? {};
  const folders: ExportFolder[] = [];
  const push = (path: string, entries: ExportEntry[]) => folders.push({ path, entries });

  // --- Main book = the ORIGINAL source (source CloneJob), split by pageType. ---
  if (input.cloneJobPages) {
    const jobPages = input.cloneJobPages;
    const included = jobPages.filter((p) => !p.excluded);
    let coverPages = included.filter((p) => p.pageType === "cover");
    if (coverPages.length === 0 && jobPages[0]) coverPages = [jobPages[0]];
    const introPages = included.filter((p) => p.pageType === "interiorIntro");
    const coverSet = new Set(coverPages);
    const introSet = new Set(introPages);
    const interiorPages = included.filter((p) => !coverSet.has(p) && !introSet.has(p));
    push("Main book/Book cover", toEntries(coverPages, "imageUrl"));
    push("Main book/Book intro", toEntries(introPages, "imageUrl"));
    push("Main book/Book interior", toEntries(interiorPages, "imageUrl"));
  }

  // --- Clone book = this Book (B&W line-art + colored + source covers). ---
  const coverCandidates = (data.coverCandidates as { url?: string }[] | null) ?? [];
  const cloneCover: ExportEntry[] =
    coverCandidates.length > 0
      ? coverCandidates
          .map((c, i) => ({ url: c.url || "", name: `cover-${pad2(i)}` }))
          .filter((e) => e.url)
      : input.coverUrl
        ? [{ url: input.coverUrl, name: "cover" }]
        : [];
  const sourceCovers = (data.sourceCovers as ExportPageLike[] | null) ?? [];
  push("Clone book/Book cover", cloneCover);
  push("Clone book/Book intro", toEntries(input.summaryPages, "url"));
  push("Clone book/Book interior", toEntries(input.coloringPages, "url"));
  push("Clone book/Book colored", toEntries(input.coloringPages, "coloredUrl"));
  push("Clone book/Source cover", toEntries(sourceCovers, "url"));
  push("Clone book/Source cover colored", toEntries(sourceCovers, "coloredUrl"));

  const allUrls = folders.flatMap((f) => f.entries.map((e) => e.url));
  const hash = createHash("sha256")
    .update(JSON.stringify(allUrls) + "|" + (input.cloneJobId ?? ""))
    .digest("hex")
    .slice(0, 16);

  return { folders, hash, filename: `${slug(input.bookTitle)}-${hash}.zip` };
}

/** Fetch an R2 image and return its bytes + detected extension (png/jpg). */
async function fetchImage(url: string): Promise<{ bytes: Uint8Array; ext: string } | null> {
  const full = resolveR2Url(url);
  if (!full || !full.startsWith("http")) return null;
  try {
    const res = await fetch(full);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) return null;
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    return { bytes, ext: isJpeg ? "jpg" : "png" };
  } catch {
    return null;
  }
}

/** Fetch every entry and pack the zip. Missing/unfetchable images are skipped. */
export async function buildExportZip(plan: ExportPlan): Promise<Buffer> {
  const zip = new JSZip();
  for (const folder of plan.folders) {
    await Promise.all(
      folder.entries.map(async (e) => {
        const img = await fetchImage(e.url);
        if (!img) return;
        zip.file(`${folder.path}/${e.name}.${img.ext}`, img.bytes);
      }),
    );
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/server-core && yarn test build-export-zip`
Expected: PASS (all cases).

- [ ] **Step 7: Commit**

```bash
git add packages/server-core/src/book-export packages/server-core/package.json yarn.lock
git commit -m "feat(export): shared book-export zip builder (plan + hash + zip)"
```

---

### Task 2: Worker `book-export` handler

**Files:**
- Modify: `apps/worker/src/processor/generation-job-processor.ts`

**Interfaces:**
- Consumes: `collectExportPlan`, `buildExportZip`, `type ExportInput` from `@vx/server-core/book-export`; `getR2Config`, `createR2Client`, `uploadToR2` from `@vx/server-core/r2`.
- Produces: dispatch branch `job.type === "book-export" → runBookExport(job.id, job.bookId)`; writes `Book.data.export = { url, hash, builtAt, filename }` and sets `GenerationJob { status:"done", resultUrl:url, resultId:hash }`.

- [ ] **Step 1: Add imports for the builder + `ExportInput` type**

At the top of `apps/worker/src/processor/generation-job-processor.ts`, extend the existing imports:
```ts
import crypto from "node:crypto";
import { prisma } from "@vx/db";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import { generateCoverSourceBW } from "@vx/server-core/ai";
import { collectExportPlan, buildExportZip, type ExportInput, type ExportPageLike } from "@vx/server-core/book-export";
```

- [ ] **Step 2: Add the dispatch branch**

In `processGenerationJob`, change the type switch to add `book-export`:
```ts
    if (job.type === "source-cover") {
      await runSourceCover(job.id, job.bookId, job.payload as unknown as SourceCoverPayload);
    } else if (job.type === "book-export") {
      await runBookExport(job.id, job.bookId);
    } else {
      throw new Error(`Unknown generation job type: ${job.type}`);
    }
```

- [ ] **Step 3: Implement `runBookExport`**

Append at the end of `apps/worker/src/processor/generation-job-processor.ts`:
```ts
/** Build the book's export ZIP, upload to R2, and cache the link on the book. */
async function runBookExport(genJobId: string, bookId: string): Promise<void> {
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) throw new Error("Book not found");

  const data = (book.data as Record<string, unknown> | null) ?? {};
  const cloneJobId = typeof data.cloneJobId === "string" ? data.cloneJobId : undefined;
  const cloneJob = cloneJobId ? await prisma.cloneJob.findUnique({ where: { id: cloneJobId } }) : null;

  const input: ExportInput = {
    bookTitle: book.title,
    bookData: data,
    coverUrl: book.coverUrl,
    summaryPages: (book.summaryPages as ExportPageLike[] | null) ?? [],
    coloringPages: (book.coloringPages as ExportPageLike[] | null) ?? [],
    cloneJobPages: (cloneJob?.pages as ExportPageLike[] | null) ?? null,
    cloneJobId,
  };

  const plan = collectExportPlan(input);
  const buffer = await buildExportZip(plan); // heavy: many R2 fetches + deflate

  const r2Config = getR2Config();
  const { url } = await uploadToR2({
    client: createR2Client(r2Config),
    config: r2Config,
    key: `assets/${bookId}/exports/${plan.filename}`,
    body: buffer,
    contentType: "application/zip",
  });

  const builtAt = new Date().toISOString();
  // Read-modify-write book.data in a short transaction (mirror runSourceCover)
  // so a concurrent write to book.data can't clobber the cached export link.
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.book.findUnique({ where: { id: bookId } });
    const d = (fresh?.data as Record<string, unknown> | null) ?? {};
    await tx.book.update({
      where: { id: bookId },
      data: { data: { ...d, export: { url, hash: plan.hash, builtAt, filename: plan.filename } } as never },
    });
  });

  await prisma.generationJob.update({
    where: { id: genJobId },
    data: { status: "done", resultUrl: url, resultId: plan.hash },
  });
}
```

- [ ] **Step 4: Typecheck the worker**

Run: `cd apps/worker && yarn typecheck` (or `npx tsc --noEmit`)
Expected: PASS — no type errors; `runBookExport` referenced by the dispatch branch. (`crypto`/`resolveR2Url` remain used by `runSourceCover`.)

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/processor/generation-job-processor.ts
git commit -m "feat(export): worker book-export handler builds zip + caches R2 link"
```

---

### Task 3: Enqueue POST route (replace synchronous GET)

**Files:**
- Modify (replace file contents): `apps/admin/src/app/api/books/[bookId]/export-zip/route.ts`

**Interfaces:**
- Consumes: `collectExportPlan`, `type ExportInput`, `type ExportPageLike` from `@vx/server-core/book-export`; `enqueueGenerationJob` from `@/lib/queue/generation-queue`; `withQueueTimeout`, `isQueueTimeout`, `queueUnavailableResponse` from `@/lib/queue/queue-timeout`.
- Produces: `POST` returns one of `{ success, cached:true, url }` | `{ success, jobId, status }` | `queueUnavailableResponse` | 404/500. No `GET`.

- [ ] **Step 1: Replace the route file**

Overwrite `apps/admin/src/app/api/books/[bookId]/export-zip/route.ts` with:
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { collectExportPlan, type ExportInput, type ExportPageLike } from "@vx/server-core/book-export";
import { enqueueGenerationJob } from "@/lib/queue/generation-queue";
import { withQueueTimeout, isQueueTimeout, queueUnavailableResponse } from "@/lib/queue/queue-timeout";

type RouteParams = { params: Promise<{ bookId: string }> };

/**
 * POST — produce a downloadable ZIP LINK for a book (async, cached).
 *
 * The ZIP is built by the worker (book-export GenerationJob), uploaded to R2,
 * and the public link is cached on `book.data.export = { url, hash, ... }`.
 * When the content hash is unchanged we return the cached link instantly with
 * no job. Progress is tracked via GET /api/generation-jobs (queue drawer).
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId } = await params;
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

    const data = (book.data as Record<string, unknown> | null) ?? {};
    const cloneJobId = typeof data.cloneJobId === "string" ? data.cloneJobId : undefined;
    const cloneJob = cloneJobId ? await prisma.cloneJob.findUnique({ where: { id: cloneJobId } }) : null;

    const input: ExportInput = {
      bookTitle: book.title,
      bookData: data,
      coverUrl: book.coverUrl,
      summaryPages: (book.summaryPages as ExportPageLike[] | null) ?? [],
      coloringPages: (book.coloringPages as ExportPageLike[] | null) ?? [],
      cloneJobPages: (cloneJob?.pages as ExportPageLike[] | null) ?? null,
      cloneJobId,
    };
    const plan = collectExportPlan(input);

    // Cache hit: content unchanged since the last build → return the link now.
    const cached = data.export as { url?: string; hash?: string } | undefined;
    if (cached?.hash === plan.hash && cached.url) {
      return NextResponse.json({ success: true, cached: true, url: cached.url });
    }

    // Dedup: reuse an in-flight book-export job for this same content hash.
    const existing = await prisma.generationJob.findFirst({
      where: { type: "book-export", bookId, status: { in: ["pending", "running"] } },
      orderBy: { createdAt: "desc" },
    });
    if (existing && (existing.payload as { hash?: string } | null)?.hash === plan.hash) {
      return NextResponse.json({ success: true, jobId: existing.id, status: existing.status });
    }

    const job = await prisma.generationJob.create({
      data: {
        type: "book-export",
        status: "pending",
        bookId,
        bookTitle: book.title,
        payload: { hash: plan.hash },
      },
    });

    try {
      await withQueueTimeout(enqueueGenerationJob(job.id));
    } catch (err) {
      if (isQueueTimeout(err)) return queueUnavailableResponse({ jobId: job.id });
      throw err;
    }

    return NextResponse.json({ success: true, jobId: job.id, status: "pending" });
  } catch (error) {
    console.error("[books/export-zip POST] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck the admin app**

Run: `cd apps/admin && yarn typecheck` (or `npx tsc --noEmit`)
Expected: PASS. (JSZip/`resolveR2Url` imports are gone from this file; the builder owns them now.)

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/api/books/[bookId]/export-zip/route.ts
git commit -m "feat(export): POST export-zip enqueues job + returns cached link (drop GET stream)"
```

---

### Task 4: Client job type + queue-drawer label & copy-link

**Files:**
- Modify: `packages/coloring/src/data/generation-jobs.ts`
- Modify: `packages/coloring/src/components/shell/generation-queue-drawer.tsx`

**Interfaces:**
- Consumes: `GenerationJob` shape (existing).
- Produces: `"book-export"` in `GenerationJobType`; drawer renders `"Xuất ZIP"` label and, for a done book-export job, a "Copy link" button that copies the resolved `resultUrl`.

- [ ] **Step 1: Extend the client job type + payload**

Edit `packages/coloring/src/data/generation-jobs.ts`:
```ts
export type GenerationJobType = "source-cover" | "book-export";
```
Add `hash` to the payload shape:
```ts
  payload?: {
    interiorPageId?: string;
    titleSafe?: "top" | "middle" | "bottom";
    prompt?: string;
    sourceImageUrl?: string;
    hash?: string;
  } | null;
```

- [ ] **Step 2: Label + non-image thumbnail + copy-link in the drawer**

Edit `packages/coloring/src/components/shell/generation-queue-drawer.tsx`.

In `typeLabel`, add a branch before the `return j.type` fallback:
```ts
function typeLabel(j: GenerationJob): string {
  if (j.type === "source-cover") {
    const pos = j.payload?.titleSafe ? ` (${TITLE_SAFE_LABEL[j.payload.titleSafe] ?? j.payload.titleSafe})` : "";
    return `Source Cover${pos}`;
  }
  if (j.type === "book-export") return "Xuất ZIP";
  return j.type;
}
```

In `JobRow`, replace the thumbnail block so a `book-export` result (a `.zip`, not an image) shows a download icon instead of a broken `<img>`, and add a "Copy link" action in the body. Replace the existing thumbnail `<div>…</div>` (the 44×44 block) with:
```tsx
      <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid var(--border)", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)" }}>
        {job.type === "book-export" ? (
          <Icon name="download" size={16} />
        ) : job.resultUrl || job.payload?.sourceImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={resolveImg(job.resultUrl || job.payload?.sourceImageUrl)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Icon name="image" size={16} />
        )}
      </div>
```

In `JobRow`, inside the middle `<div style={{ flex: 1, … }}>` block, after the error line, add a copy-link row for done exports:
```tsx
        {job.type === "book-export" && job.status === "done" && job.resultUrl && (
          <button
            type="button"
            className="mo-textbtn"
            onClick={(e) => {
              e.stopPropagation();
              const full = resolveImg(job.resultUrl);
              if (full) navigator.clipboard?.writeText(full);
            }}
            style={{ alignSelf: "flex-start", fontSize: 11.5, color: "var(--volt-600)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            title="Copy link tải ZIP"
          >
            <Icon name="link" size={12} /> Copy link
          </button>
        )}
```

- [ ] **Step 3: Typecheck the coloring package**

Run: `cd packages/coloring && yarn typecheck` (or `npx tsc --noEmit`)
Expected: PASS. (`Icon` and `resolveImg` are already imported in the drawer.)

- [ ] **Step 4: Commit**

```bash
git add packages/coloring/src/data/generation-jobs.ts packages/coloring/src/components/shell/generation-queue-drawer.tsx
git commit -m "feat(export): queue drawer shows book-export label + copy-link"
```

---

### Task 5: Book detail — export-link button

**Files:**
- Create: `packages/coloring/src/screens/books/export-link-button.tsx`
- Modify: `packages/coloring/src/screens/books/book-detail-screen.tsx` (replace the old Export ZIP button)

**Interfaces:**
- Consumes: `useGenerationJobs`, `isActiveGenerationJob`, `resolveImg`, `COLORING_API_BASE`; `book.data.export` shape `{ url, hash, builtAt, filename }`.
- Produces: `<ExportLinkButton bookId={...} />` toolbar control.

- [ ] **Step 1: Create the ExportLinkButton component**

Create `packages/coloring/src/screens/books/export-link-button.tsx`:
```tsx
"use client";

import { useState } from "react";
import { httpPost } from "@vx/core-uikit/api";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { resolveImg } from "../../data/img";
import { COLORING_API_BASE } from "../../data/config";
import { useGenerationJobs } from "../../data/use-generation-jobs";
import { isActiveGenerationJob } from "../../data/generation-jobs";

type ExportInfo = { url?: string; hash?: string; builtAt?: string; filename?: string };

/**
 * Toolbar control that turns a book's export into a copyable download LINK.
 * - No cached link yet → "Tạo link export" button (POST enqueues a book-export job).
 * - A book-export job is active → "Đang tạo…" (progress lives in the queue drawer).
 * - Cached link present → show the link + Copy, plus a "Cập nhật" rebuild.
 * The cached link comes from `book.data.export`; when the worker finishes, the
 * global queue poll invalidates the book query and this re-renders with the url.
 */
export function ExportLinkButton({ bookId, exportInfo }: { bookId: string; exportInfo?: ExportInfo }) {
  const { jobs, refetch } = useGenerationJobs();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const active = jobs.some((j) => j.bookId === bookId && j.type === "book-export" && isActiveGenerationJob(j));
  const fullUrl = exportInfo?.url ? resolveImg(exportInfo.url) : undefined;

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      await httpPost(`${COLORING_API_BASE}/books/${bookId}/export-zip`, {});
      // Reflect the newly-created pending job immediately (idle poll is 30s).
      await refetch();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Tạo link thất bại");
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (!fullUrl) return;
    navigator.clipboard?.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (active) {
    return (
      <Button variant="outline" size="sm" disabled title="Đang build ZIP ở nền — theo dõi ở hàng đợi tạo ảnh">
        <Icon name="loader" size={16} /> Đang tạo link…
      </Button>
    );
  }

  if (fullUrl) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Button variant="outline" size="sm" onClick={copy} title={fullUrl}>
          <Icon name={copied ? "check" : "link"} size={16} /> {copied ? "Đã copy" : "Copy link ZIP"}
        </Button>
        <Button variant="ghost" size="sm" onClick={create} disabled={busy} title="Build lại ZIP (khi sách đã đổi)">
          <Icon name="refresh-cw" size={15} /> {busy ? "…" : "Cập nhật"}
        </Button>
        {err && <span style={{ fontSize: 11.5, color: "var(--danger)" }}>{err}</span>}
      </span>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={create}
      disabled={busy}
      title="Tạo link tải ZIP (Main + Clone, cover + interior) — build ở nền rồi copy link"
    >
      <Icon name="download" size={16} /> {busy ? "Đang tạo…" : "Tạo link export"}
      {err && <span style={{ fontSize: 11.5, color: "var(--danger)", marginLeft: 6 }}>{err}</span>}
    </Button>
  );
}
```

- [ ] **Step 2: Wire it into the book detail toolbar**

Edit `packages/coloring/src/screens/books/book-detail-screen.tsx`.

Add the import near the other `./books` imports (after line 29 `SourceCoverSection`):
```ts
import { ExportLinkButton } from "./export-link-button";
```

Derive the export info alongside the other `b.data?.*` reads (near line 235, after `sourceCovers`):
```ts
  const exportInfo = (b.data?.export ?? undefined) as { url?: string; hash?: string; builtAt?: string; filename?: string } | undefined;
```

Replace the old Export ZIP button (the `<Button … Export ZIP</Button>` block, currently lines 387–390) with:
```tsx
          <ExportLinkButton bookId={bookId} exportInfo={exportInfo} />
```

- [ ] **Step 3: Remove the now-unused `COLORING_API_BASE` import if it is no longer referenced**

Check `packages/coloring/src/screens/books/book-detail-screen.tsx` for other uses of `COLORING_API_BASE`.
Run: `cd packages/coloring && npx tsc --noEmit`
- If tsc reports `COLORING_API_BASE` is declared but never used, remove it from the line 25 import (`import { COLORING_WRITE_ENABLED, COLORING_API_BASE } from "../../data/config";` → `import { COLORING_WRITE_ENABLED } from "../../data/config";`).
- If it is still used elsewhere, leave the import as-is.
Expected: PASS with no unused-var error.

- [ ] **Step 4: Commit**

```bash
git add packages/coloring/src/screens/books/export-link-button.tsx packages/coloring/src/screens/books/book-detail-screen.tsx
git commit -m "feat(export): book detail export-link button (copy R2 zip link)"
```

---

### Task 6: End-to-end verification on staging

**Files:** none (manual verification).

- [ ] **Step 1: Preconditions**

Ensure the worker is running against Redis and R2 creds are set (staging). Confirm `NEXT_PUBLIC_COLORING_WRITE=1` is not required for export (export is not write-gated — it only reads book images and writes an export artifact; the button is always enabled).

- [ ] **Step 2: First build**

Open a real book's detail screen → click **"Tạo link export"**.
Expected: button switches to **"Đang tạo link…"**; the queue drawer shows a **"Xuất ZIP"** job going pending → running → done.

- [ ] **Step 3: Link appears + downloads**

When the job completes, the book detail shows **"Copy link ZIP"**. Click it → a full `https://<cdn>/assets/<bookId>/exports/<slug>-<hash>.zip` URL is copied.
Paste the URL in a new tab (or a download manager) → the ZIP downloads and opens with the expected `Main book/` + `Clone book/` folder layout.

- [ ] **Step 4: Cache hit**

Click **"Cập nhật"** without changing the book.
Expected: near-instant; POST returns `{ cached: true }` (no new job in the drawer), the same link stays.

- [ ] **Step 5: Rebuild on change**

Regen/add a page (changes the image URL set), then click **"Cập nhật"**.
Expected: a NEW book-export job runs; when done, the link's `<hash>` changes.

- [ ] **Step 6: Redis-down guard (optional)**

With the worker/Redis stopped, click "Tạo link export".
Expected: 503 with the Vietnamese "Không kết nối được hàng đợi…" message (from `queueUnavailableResponse`); the job row is persisted and re-enqueues when the worker restarts.

---

## Notes for the implementer

- **Do not keep the old GET download** — the spec removed it; the R2 link is the download.
- **`httpPost` signature:** `httpPost(url, body)` from `@vx/core-uikit/api` (same import used across the coloring package). Pass `{}` as the body.
- **Icon names** used (`download`, `link`, `loader`, `check`, `refresh-cw`) must exist in `../../lib/icon`. If `refresh-cw` or `link` is missing, substitute an existing icon (e.g. `copy` for link, `rotate-cw`/`sparkles` for refresh) — grep `packages/coloring/src/lib/icon` for the available set before finalizing.
- **`resultId` = hash** is intentional (handy for debugging which content version a job built); it is not read back anywhere.
```
