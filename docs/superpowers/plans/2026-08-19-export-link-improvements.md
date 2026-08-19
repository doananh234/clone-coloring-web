# Export Link Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the book-export ZIP link stable (fixed per-book R2 key that re-exports overwrite, so copied links stay valid) and add a one-click copy-zip-link icon to the "My Queue" kanban cards.

**Architecture:** Move the export ZIP from a content-hashed key to a fixed key `assets/{bookId}/exports/export.zip` (URL never changes), served with `Content-Disposition` (nice download name) and `Cache-Control: no-cache` (CDN revalidates after overwrite). A shared `stableExportUrl(bookId)` keeps the worker's upload key and the route's cache-check in sync. The books-list route already returns `data`, so it exposes a derived `exportUrl` for the kanban card.

**Tech Stack:** TypeScript, Next.js API routes, BullMQ worker, Prisma, Cloudflare R2 (S3 SDK), Vitest, React + @dnd-kit.

## Global Constraints

- **Fixed R2 key:** `assets/{bookId}/exports/export.zip` — never changes, even if the book title changes. Re-export overwrites the same object.
- **Download name:** upload with `Content-Disposition: attachment; filename="{slug}.zip"` (slug of the book title).
- **CDN freshness:** upload with `Cache-Control: no-cache`.
- **Single source of the key:** `stableExportUrl(bookId)` returns `/assets/${bookId}/exports/export.zip`; the worker derives its upload key from it and the route's cache-check compares against it — they must never drift.
- **Cache-hit condition:** `data.export.hash === plan.hash` AND `data.export.url === stableExportUrl(bookId)` (the url check auto-migrates books still holding an old hash-named url).
- **`collectExportPlan().filename`** = `${slug(bookTitle)}.zip` (no hash — it is only the human download name now, not the storage key). `hash` is still returned for caching.
- **Kanban copy icon:** top-right of each card, rendered only when `book.exportUrl` is set; copies the FULL resolved URL (`resolveImg(book.exportUrl)`); `stopPropagation` on pointer-down AND click so it never starts a drag or opens the book; icon name `copy` (the registry has `copy`, not `link`).
- **No new detail-screen UI** (reuse the existing "Cập nhật" button); no auto-rebuild-on-change; no Cloudflare purge (only if staging proves `Cache-Control` insufficient).
- Vietnamese UI copy.
- **Gate commands (verified for this repo):** server-core → `cd packages/server-core && yarn test <file>` and `yarn typecheck`; worker (no typecheck script) → `cd apps/worker && npx tsc --noEmit`; coloring (no typecheck script) → `cd apps/admin && yarn typecheck` (judge by DELTA — admin baseline has pre-existing + `.next` noise; confirm no error references the changed file).

---

### Task 1: Builder — stable download filename + `stableExportUrl` helper

**Files:**
- Modify: `packages/server-core/src/book-export/build-export-zip.ts`
- Modify: `packages/server-core/src/book-export/build-export-zip.test.ts`

**Interfaces:**
- Consumes: existing `collectExportPlan`, `slug` (internal).
- Produces: `stableExportUrl(bookId: string): string` → `/assets/${bookId}/exports/export.zip` (exported; consumed by Tasks 3 & 4). `collectExportPlan().filename` now `${slug(bookTitle)}.zip`.

- [ ] **Step 1: Update the failing test to the new filename + add a `stableExportUrl` test**

In `packages/server-core/src/book-export/build-export-zip.test.ts`:

Change the existing filename assertion (currently line 43):
```ts
    expect(plan.filename).toBe(`cute-farm-${plan.hash}.zip`);
```
to:
```ts
    expect(plan.filename).toBe("cute-farm.zip");
```

Add a new import at the top — extend the existing import from `./build-export-zip` to include `stableExportUrl`:
```ts
import { collectExportPlan, buildExportZip, stableExportUrl, type ExportInput } from "./build-export-zip";
```

Add a new `describe` block at the end of the file:
```ts
describe("stableExportUrl", () => {
  it("returns a fixed per-book path independent of title", () => {
    expect(stableExportUrl("abc123")).toBe("/assets/abc123/exports/export.zip");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/server-core && yarn test build-export-zip`
Expected: FAIL — `stableExportUrl` is not exported yet, and the filename assertion expects `cute-farm.zip` while the code still returns `cute-farm-<hash>.zip`.

- [ ] **Step 3: Implement — drop the hash from `filename` and add `stableExportUrl`**

In `packages/server-core/src/book-export/build-export-zip.ts`, change the return of `collectExportPlan` (currently line 90):
```ts
  return { folders, hash, filename: `${slug(input.bookTitle)}-${hash}.zip` };
```
to:
```ts
  return { folders, hash, filename: `${slug(input.bookTitle)}.zip` };
```

Add this exported helper at the end of the file:
```ts
/**
 * The single, stable R2 path a book's export ZIP always lives at. Fixed per
 * book (independent of the title) so a copied download link keeps working after
 * a re-export overwrites the object. The worker uploads to this key and the API
 * route compares the cached url against it — both derive from here so they can
 * never drift.
 */
export function stableExportUrl(bookId: string): string {
  return `/assets/${bookId}/exports/export.zip`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/server-core && yarn test build-export-zip`
Expected: PASS (all existing cases + the new `stableExportUrl` case; the `buildExportZip` and hash tests are unaffected).

- [ ] **Step 5: Commit**

```bash
git add packages/server-core/src/book-export/build-export-zip.ts packages/server-core/src/book-export/build-export-zip.test.ts
git commit -m "feat(export): stable download filename + stableExportUrl helper"
```

---

### Task 2: R2 helper — forward `cacheControl` + `contentDisposition`

**Files:**
- Modify: `packages/server-core/src/r2.ts`
- Create: `packages/server-core/src/r2.test.ts`

**Interfaces:**
- Produces: `uploadToR2` accepts two new optional params `cacheControl?: string` and `contentDisposition?: string`, forwarded to the `PutObjectCommand` input as `CacheControl` / `ContentDisposition`. Signature otherwise unchanged; existing callers unaffected.

- [ ] **Step 1: Write the failing test**

Create `packages/server-core/src/r2.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { uploadToR2, type R2Config } from "./r2";

const config: R2Config = {
  accountId: "acc",
  accessKeyId: "key",
  secretAccessKey: "secret",
  bucket: "bucket",
  publicBaseUrl: "",
};

describe("uploadToR2", () => {
  it("forwards cacheControl + contentDisposition to the PutObjectCommand input", async () => {
    const send = vi.fn().mockResolvedValue({});
    // uploadToR2 takes the client as a param, so a stub with `send` is enough.
    const client = { send } as unknown as import("@aws-sdk/client-s3").S3Client;

    const { url } = await uploadToR2({
      client,
      config,
      key: "assets/b1/exports/export.zip",
      body: Buffer.from("zip-bytes"),
      contentType: "application/zip",
      cacheControl: "no-cache",
      contentDisposition: 'attachment; filename="Cute farm.zip"',
    });

    expect(send).toHaveBeenCalledTimes(1);
    const cmd = send.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(cmd.input.Key).toBe("assets/b1/exports/export.zip");
    expect(cmd.input.ContentType).toBe("application/zip");
    expect(cmd.input.CacheControl).toBe("no-cache");
    expect(cmd.input.ContentDisposition).toBe('attachment; filename="Cute farm.zip"');
    expect(url).toBe("/assets/b1/exports/export.zip");
  });

  it("omits the optional headers when not provided", async () => {
    const send = vi.fn().mockResolvedValue({});
    const client = { send } as unknown as import("@aws-sdk/client-s3").S3Client;
    await uploadToR2({ client, config, key: "assets/b1/x.png", body: Buffer.from("x") });
    const cmd = send.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(cmd.input.CacheControl).toBeUndefined();
    expect(cmd.input.ContentDisposition).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/server-core && yarn test r2`
Expected: FAIL — `uploadToR2` does not accept `cacheControl`/`contentDisposition` yet, so `CacheControl`/`ContentDisposition` are `undefined` in the first test.

- [ ] **Step 3: Implement — add the optional params**

In `packages/server-core/src/r2.ts`, replace the `uploadToR2` function (currently lines 64–86):
```ts
export async function uploadToR2(params: {
  client: S3Client;
  config: R2Config;
  key: string;
  body: Buffer;
  contentType?: string;
}): Promise<{ key: string; url: string }> {
  const { client, config, key, body, contentType } = params;
  const ct = contentType || guessContentType(key);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: ct,
    }),
  );

  // Store relative path only — CDN host is resolved at read time via resolveR2Url()
  const url = `/${key}`;
  return { key, url };
}
```
with:
```ts
export async function uploadToR2(params: {
  client: S3Client;
  config: R2Config;
  key: string;
  body: Buffer;
  contentType?: string;
  cacheControl?: string;
  contentDisposition?: string;
}): Promise<{ key: string; url: string }> {
  const { client, config, key, body, contentType, cacheControl, contentDisposition } = params;
  const ct = contentType || guessContentType(key);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: ct,
      ...(cacheControl ? { CacheControl: cacheControl } : {}),
      ...(contentDisposition ? { ContentDisposition: contentDisposition } : {}),
    }),
  );

  // Store relative path only — CDN host is resolved at read time via resolveR2Url()
  const url = `/${key}`;
  return { key, url };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/server-core && yarn test r2`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add packages/server-core/src/r2.ts packages/server-core/src/r2.test.ts
git commit -m "feat(r2): uploadToR2 forwards cacheControl + contentDisposition"
```

---

### Task 3: Worker — upload to the fixed key with cache + disposition headers

**Files:**
- Modify: `apps/worker/src/processor/generation-job-processor.ts`

**Interfaces:**
- Consumes: `stableExportUrl` from `@vx/server-core/book-export` (Task 1); `uploadToR2` with the new `cacheControl`/`contentDisposition` params (Task 2); `collectExportPlan`/`buildExportZip` (existing).
- Produces: the worker uploads a book's export ZIP to `assets/{bookId}/exports/export.zip` with `Cache-Control: no-cache` and `Content-Disposition: attachment; filename="{slug}.zip"`, and writes `book.data.export.url = stableExportUrl(bookId)`.

- [ ] **Step 1: Import `stableExportUrl`**

In `apps/worker/src/processor/generation-job-processor.ts`, extend the existing book-export import:
```ts
import { collectExportPlan, buildExportZip, stableExportUrl, type ExportInput, type ExportPageLike } from "@vx/server-core/book-export";
```

- [ ] **Step 2: Upload to the fixed key with the new headers**

In `runBookExport`, replace the upload block. Current code:
```ts
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
```
Replace with:
```ts
  const plan = collectExportPlan(input);
  const buffer = await buildExportZip(plan); // heavy: many R2 fetches + deflate

  const r2Config = getR2Config();
  // Fixed per-book key so a copied link stays valid across re-exports; the
  // object is overwritten each time. Content-Disposition gives the download a
  // title-based name despite the fixed key; Cache-Control makes the CDN
  // revalidate after an overwrite instead of serving the stale ZIP.
  const key = stableExportUrl(bookId).replace(/^\//, "");
  const { url } = await uploadToR2({
    client: createR2Client(r2Config),
    config: r2Config,
    key,
    body: buffer,
    contentType: "application/zip",
    cacheControl: "no-cache",
    contentDisposition: `attachment; filename="${plan.filename}"`,
  });
```
(`url` returned by `uploadToR2` is `/${key}` === `stableExportUrl(bookId)`, so the existing `book.data.export = { url, hash, builtAt, filename }` write already stores the stable url — no further change to that block.)

- [ ] **Step 3: Typecheck the worker**

Run: `cd apps/worker && npx tsc --noEmit`
Expected: PASS — no error referencing `generation-job-processor.ts`. (The worker has ~16 PRE-EXISTING baseline errors in OTHER files — `step-deps.ts`, `image-provider-diaflow.ts`, `llm-provider.ts`, `pdf-renderer.ts`; confirm none reference the changed file: `cd apps/worker && npx tsc --noEmit 2>&1 | grep generation-job-processor` → expect EMPTY.)

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/processor/generation-job-processor.ts
git commit -m "feat(export): worker uploads to fixed key with cache + disposition headers"
```

---

### Task 4: Route — cache-hit requires the stable url (auto-migrate old urls)

**Files:**
- Modify: `apps/admin/src/app/api/books/[bookId]/export-zip/route.ts`

**Interfaces:**
- Consumes: `stableExportUrl` from `@vx/server-core/book-export` (Task 1).
- Produces: the POST cache-hit branch returns the cached url only when `data.export.hash === plan.hash` AND `data.export.url === stableExportUrl(bookId)`; otherwise it falls through to dedup/create (which rebuilds and writes the stable url).

- [ ] **Step 1: Import `stableExportUrl`**

In `apps/admin/src/app/api/books/[bookId]/export-zip/route.ts`, extend the book-export import:
```ts
import { collectExportPlan, stableExportUrl, type ExportInput, type ExportPageLike } from "@vx/server-core/book-export";
```

- [ ] **Step 2: Tighten the cache-hit condition**

Find the cache-hit block (it reads the stored export and returns when the hash matches). Current code:
```ts
    // 1. Cache hit — content hash matches the stored export link; return it now.
    const cached = data.export as { url?: string; hash?: string; filename?: string } | undefined;
    if (cached?.hash === plan.hash && cached.url) {
      return NextResponse.json({
        success: true,
        cached: true,
        url: cached.url,
        filename: cached.filename ?? plan.filename,
        hash: plan.hash,
      });
    }
```
Replace with:
```ts
    // 1. Cache hit — content hash matches AND the stored url is the current
    //    stable key. The url check auto-migrates a book still holding an
    //    old hash-named url from the previous version: same content but
    //    old-format url → treated as a miss → one rebuild writes the stable key.
    const cached = data.export as { url?: string; hash?: string; filename?: string } | undefined;
    if (cached?.hash === plan.hash && cached.url === stableExportUrl(bookId)) {
      return NextResponse.json({
        success: true,
        cached: true,
        url: cached.url,
        filename: cached.filename ?? plan.filename,
        hash: plan.hash,
      });
    }
```

- [ ] **Step 3: Typecheck the admin app (delta)**

Run: `cd apps/admin && yarn typecheck`
Then confirm no error references this file: `cd apps/admin && yarn typecheck 2>&1 | grep export-zip` → expect EMPTY.
Expected: no new errors attributable to the route (admin baseline / `.next` noise unchanged).

- [ ] **Step 4: Commit**

```bash
git add "apps/admin/src/app/api/books/[bookId]/export-zip/route.ts"
git commit -m "feat(export): cache-hit requires stable url (auto-migrate old exports)"
```

---

### Task 5: Books list exposes `exportUrl`

**Files:**
- Modify: `apps/admin/src/app/api/books/route.ts`
- Modify: `packages/coloring/src/data/types.ts`

**Interfaces:**
- Produces: each row from the books-list GET gains `exportUrl: string | null` (from `data.export.url`); `BookRow` gains `exportUrl?: string | null`. Consumed by Task 6.

- [ ] **Step 1: Derive `exportUrl` in the list route mapping**

In `apps/admin/src/app/api/books/route.ts`, the list handler already maps rows to add `niche` and `queueStatus`. Current mapping:
```ts
    const data = rows.map((b) => ({
      ...b,
      niche: (b.data as { niche?: unknown } | null)?.niche ?? null,
      queueStatus: (b.data as { queueStatus?: unknown } | null)?.queueStatus ?? "todo",
    }));
```
Replace with (add the `exportUrl` line):
```ts
    const data = rows.map((b) => ({
      ...b,
      niche: (b.data as { niche?: unknown } | null)?.niche ?? null,
      queueStatus: (b.data as { queueStatus?: unknown } | null)?.queueStatus ?? "todo",
      exportUrl: (b.data as { export?: { url?: string } } | null)?.export?.url ?? null,
    }));
```

- [ ] **Step 2: Add `exportUrl` to `BookRow`**

In `packages/coloring/src/data/types.ts`, in the `BookRow` interface, add the field after `specifications` (the last field before the closing brace, currently line 20):
```ts
  specifications?: { pages?: number } | null;
  /** Stable download URL of the book's export ZIP (from data.export.url), or null. */
  exportUrl?: string | null;
```

- [ ] **Step 3: Typecheck the admin app (delta)**

Run: `cd apps/admin && yarn typecheck`
Then: `cd apps/admin && yarn typecheck 2>&1 | grep -E "books/route|types.ts"` → expect EMPTY (no new errors from these files).
Expected: no new errors attributable to the change.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/api/books/route.ts packages/coloring/src/data/types.ts
git commit -m "feat(export): books list surfaces exportUrl for the queue card"
```

---

### Task 6: Kanban card — copy-zip-link icon

**Files:**
- Modify: `packages/coloring/src/screens/queue/queue-kanban.tsx`

**Interfaces:**
- Consumes: `book.exportUrl` on `BookRow` (Task 5); `resolveImg` from `../../data/img`.
- Produces: a top-right copy button on each `Card` when `book.exportUrl` is set.

- [ ] **Step 1: Import `resolveImg`**

In `packages/coloring/src/screens/queue/queue-kanban.tsx`, the file imports `thumbImg` from `../../data/img` (line 8). Extend it to also import `resolveImg`:
```ts
import { thumbImg, resolveImg } from "../../data/img";
```

- [ ] **Step 2: Add copied-state + the top-right copy button to `Card`**

In the `Card` component, add a `copied` state at the top of the function body (right after the `useDraggable(...)` line):
```ts
  const [copied, setCopied] = useState(false);
```

Add `position: "relative"` to the outer card `<div>`'s `style` object (so the absolute button anchors to the card). Change the style object's start from:
```ts
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        cursor: "grab",
        touchAction: "none",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: 10,
        display: "flex",
        gap: 10,
        alignItems: "center",
      }}
```
to (add `position: "relative"`):
```ts
      style={{
        position: "relative",
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        cursor: "grab",
        touchAction: "none",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: 10,
        display: "flex",
        gap: 10,
        alignItems: "center",
      }}
```

Then, immediately BEFORE the closing `</div>` of the card (after the title/badges block), add the copy button:
```tsx
      {book.exportUrl && (
        <button
          type="button"
          // Stop the pointer-down from reaching the card's drag listeners, and
          // the click from reaching the card's onClick (which opens the book).
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            const full = resolveImg(book.exportUrl);
            if (!full || !navigator.clipboard) return;
            navigator.clipboard
              .writeText(full)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              })
              .catch(() => {});
          }}
          title="Copy link ZIP"
          aria-label="Copy link ZIP"
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--background)",
            cursor: "pointer",
            color: copied ? "var(--success)" : "var(--muted-foreground)",
          }}
        >
          <Icon name={copied ? "check" : "copy"} size={13} />
        </button>
      )}
```

- [ ] **Step 3: Typecheck the coloring package via admin (delta)**

Run: `cd apps/admin && yarn typecheck`
Then: `cd apps/admin && yarn typecheck 2>&1 | grep queue-kanban` → expect EMPTY.
Expected: no new errors attributable to `queue-kanban.tsx`. (`useState` and `Icon` are already imported in the file.)

- [ ] **Step 4: Commit**

```bash
git add packages/coloring/src/screens/queue/queue-kanban.tsx
git commit -m "feat(export): copy-zip-link icon on My Queue kanban cards"
```

---

### Task 7: Staging verification (manual)

**Files:** none.

- [ ] **Step 1: Deploy the branch (merged to main) to staging/prod** — see the prior feature's flow (scp server `.env.prod` down first, then `./deploy.sh`). Requires Redis + worker running.

- [ ] **Step 2: Stable-link overwrite**

Open a book → "Tạo link export" (or "Cập nhật") → wait for the job → copy the link. It must be `https://<cdn>/assets/<bookId>/exports/export.zip` (no hash). Download it — a valid ZIP with the `Main book/` + `Clone book/` layout, and the browser saves it as `<title>.zip` (Content-Disposition).

- [ ] **Step 3: Re-export overwrites the SAME url with fresh content**

Change the book (e.g. regen a page), then click "Cập nhật". When the job finishes, the copied link's URL is IDENTICAL, and re-downloading it yields the NEW ZIP (not the stale one). If it serves stale, the `Cache-Control: no-cache` is being overridden by a zone cache rule → track a Cloudflare purge follow-up.

- [ ] **Step 4: Queue quick-copy**

On "Hàng đợi của tôi", a book that has an export link shows a copy icon at the card's top-right; clicking it copies a working link and does NOT open the book or start a drag. A book with no export shows no icon.

---

## Notes for the implementer

- `Icon` names used: `copy`, `check` — both exist in `packages/coloring/src/lib/icon.tsx`. `link` does NOT exist (renders null) — do not use it.
- Do not omit `data` from the books-list payload — other list consumers read from it; only ADD the derived `exportUrl`.
- The fixed key means the previous version's hash-named objects are orphaned; that is intentional and out of scope (only test exports exist).
