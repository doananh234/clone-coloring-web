# CSV Book-Clone Import + Serial Queue + Telegram Notify

**Status:** Approved (design)
**Date:** 2026-06-27
**Author:** anh doan

## Goal

Bulk-import a CSV of source books, run each through the existing clone pipeline serially in a long-running worker with per-step retry + backoff, auto-create a derivative book on completion, link it back to the CSV source, and notify Telegram on success/failure on two separate channels.

## Why

Today every clone is a manual browser-driven flow in `clone-page.tsx`. With ~100+ source books to clone, the operator cannot babysit step-by-step, and LLM rate limits make naive bulk parallel runs unworkable. We need a fire-and-forget pipeline that respects rate limits and surfaces results out-of-band.

## Non-goals

- No change to the `books` Firestore model.
- No retry of *successful* steps (idempotency of analyze/extract is not assumed).
- No multi-tenant / per-user queues — single global queue.
- No streaming progress in Telegram (one message per terminal state).

---

## Architecture

```
Admin (Next.js / Vercel)              Worker (Node / Fly.io)
┌────────────────────────┐            ┌──────────────────────────────┐
│ /clone Import tab      │            │ CloneJobProcessor (serial)   │
│  ↓ POST import-csv     │            │  download → render → analyze │
│ writes sourceBooks +   │── Redis ──▶│  → extract-entities          │
│ cloneJobs + enqueues   │  BullMQ    │  → reproduce → create-book   │
│                        │  concur=1  │  (each: exp-backoff retry)   │
│ /clone Queue tab       │            │                              │
│  onSnapshot cloneJobs  │            │ TelegramNotifier             │
└────────────────────────┘            │  success → CHAT_A            │
         │                            │  failure → CHAT_B            │
         ▼                            └──────────────────────────────┘
   Firestore: sourceBooks (new), cloneJobs (+sourceBookId), books (unchanged)
```

**Decisions and rationale:**

- **External queue (BullMQ + Redis), not Vercel cron.** Pipeline takes 10–30 min per job; Vercel functions cap at 5 min. BullMQ gives FIFO, pause/resume, DLQ, and `concurrency=1` out of the box.
- **Separate `apps/worker` process.** Keeps long-running work off the serverless platform; uses the same Firebase Admin SDK as the admin app for Firestore writes.
- **Shared `packages/clone-core` package.** Extracts the per-step logic currently inside `apps/admin/src/app/api/clone/[jobId]/*/route.ts` so the worker and the existing HTTP routes call the **same** code. Prevents logic drift between manual-UI runs and queue runs.

---

## Data model (additive only)

### New collection: `sourceBooks`

Doc id = CSV `_id` column (natural dedupe key).

```ts
// packages/clone-core/src/types/source-book.ts
export type SourceBook = {
  id: string;                  // = CSV `_id`
  fileName: string;
  fileSize: number;
  brand: string;               // CSV `topicName (Brand)`
  thumbnailUrl: string;
  sourcePdfUrl: string;        // CSV `book url`
  niche?: string;
  priority?: string;
  selectedInCsv: boolean;      // mirror of CSV `Select` for traceability
  importedFromCsv: string;     // `<filename>@<ISO timestamp>`
  createdAt: string;
};
```

### Additions to existing `cloneJobs`

```ts
type CloneJob = {
  // ...existing fields unchanged
  sourceBookId?: string;       // FK → sourceBooks.id (set when from CSV)
  currentStep?: CloneStep;     // for crash-resume + UI progress
  retryHistory?: Array<{
    step: CloneStep;
    attempt: number;
    error: string;
    at: string;                // ISO
  }>;
  failedStep?: CloneStep;      // step that exhausted retries
  startedAt?: string;
  finishedAt?: string;
};

type CloneStep =
  | "download"
  | "render"
  | "analyze"
  | "extract-entities"
  | "reproduce"
  | "create-book";
```

### Book ↔ source lookup

`books` model is unchanged. To list derivatives of source X:

```ts
const jobs = await db.collection("cloneJobs")
  .where("sourceBookId", "==", X)
  .where("status", "==", "reproduced")
  .get();
const bookIds = jobs.docs.map(d => d.data().resultBookId);
```

Add composite index `(sourceBookId, status)` on `cloneJobs`.

---

## CSV import

### Endpoint

`POST /api/clone/import-csv` (multipart, optional `?dryRun=1`).

CSV header (verbatim from sample):
`_id, fileName, fileSize, topicName (Brand), thumbnailUrl, thumbnailPreview, book url, Select, Remove, Niche, Priority`

Steps:

1. Stream-parse with `papaparse`.
2. Map each row → `SourceBook` candidate. Reject rows missing `_id` or `book url` into `invalid[]`.
3. Batch-read existing `sourceBooks/<id>` for all candidate ids; split into `new[]` and `skip[]` (skip = id already exists).
4. **Per row, single Firestore transaction:** write `sourceBooks/<id>` + write `cloneJobs/<jobId>` (`status: "queued"`, `sourceBookId`, `sourcePdfUrl`).
5. After all transactions commit, enqueue BullMQ jobs (`jobId` = Firestore `cloneJobs` id, idempotent).
6. Return `{ imported: N, skipped: M, invalid: K, jobIds: [...] }`.

**Idempotent re-import:** CSV `_id` doubles as Firestore doc id; re-uploading the same CSV is a no-op. The user said "import all rows, skip duplicates" — implemented via doc-id collision check, no use of `Select` filter.

**Atomicity story:** if Redis is down, jobs sit in Firestore as `queued`; the reconciler (below) pushes them when the worker boots.

### UI

`/clone` becomes a 3-tab page:

| Tab | What |
|---|---|
| Import | Drop CSV → dry-run preview ("120 new, 30 dup, 2 invalid") → confirm → toast |
| Queue | Live table of recent `cloneJobs` via Firestore `onSnapshot`; row actions: View / Retry-from-failed / Cancel; header: Pause / Resume queue |
| Manual upload | Existing `clone-page.tsx` flow, unchanged |

---

## Worker

### Layout

```
apps/worker/
├── src/
│   ├── index.ts                       # boot, signal handling, reconciler
│   ├── queue.ts                       # BullMQ Queue + Worker (concurrency=1)
│   ├── env.ts                         # zod-validated env
│   ├── firestore.ts                   # admin SDK init
│   ├── processor/
│   │   └── clone-job-processor.ts     # orchestrates 6 steps
│   ├── notify/
│   │   ├── telegram.ts
│   │   └── format.ts                  # MarkdownV2-safe formatters
│   └── reconciler.ts                  # boot-time recovery
├── package.json
├── tsconfig.json
└── Dockerfile

packages/clone-core/
└── src/
    ├── types.ts                       # CloneStep, JobContext, RetryPolicy
    ├── retry.ts                       # withRetry, isRateLimitError
    ├── steps/
    │   ├── download.ts
    │   ├── render.ts
    │   ├── analyze.ts
    │   ├── extract-entities.ts
    │   ├── reproduce.ts
    │   └── create-book.ts
    └── index.ts
```

### BullMQ config

```ts
export const cloneQueue = new Queue("clone-jobs", {
  connection: redis,
  defaultJobOptions: {
    attempts: 1,                             // step-level retry handled in-process
    removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
    removeOnFail:     { age: 30 * 24 * 3600 },
  },
});

export const cloneWorker = new Worker(
  "clone-jobs",
  async (job) => processCloneJob(job.data.cloneJobId),
  {
    connection: redis,
    concurrency: 1,
    lockDuration: 60_000,
    stalledInterval: 30_000,
  },
);
```

### Retry policy (in `packages/clone-core/src/retry.ts`)

```ts
export const RETRY_POLICY = {
  maxAttempts: 5,
  baseDelayMs: 10_000,        // 10s
  maxDelayMs: 5 * 60_000,     // cap 5 min
  jitterMs: 2_000,
  interStepCooldownMs: 5_000, // applied after each *successful* step
};
```

Per-attempt wait: 10s, 20s, 40s, 80s, 160s (capped at 5 min) + 0–2s jitter.
`isRateLimitError(err)` returns true on HTTP 429 or `RESOURCE_EXHAUSTED` (Gemini). Non-retryable errors (missing PDF, invalid config) short-circuit and fail the step on attempt 1.

### Job orchestration

```ts
export async function processCloneJob(jobId: string) {
  const ctx = await JobContext.load(jobId);
  try {
    if (!ctx.isDone("download"))         await withRetry("download",         () => stepDownload(ctx),         ctx);
    if (!ctx.isDone("render"))           await withRetry("render",           () => stepRender(ctx),           ctx);
    if (!ctx.isDone("analyze"))          await withRetry("analyze",          () => stepAnalyze(ctx),          ctx);
    if (!ctx.isDone("extract-entities")) await withRetry("extract-entities", () => stepExtractEntities(ctx),  ctx);
    if (!ctx.isDone("reproduce"))        await withRetry("reproduce",        () => stepReproduce(ctx),        ctx);
    const bookId = ctx.isDone("create-book")
      ? ctx.resultBookId!
      : await withRetry("create-book", () => stepCreateBook(ctx), ctx);

    await ctx.markComplete(bookId);
    await notifySuccess(ctx, bookId);
  } catch (err) {
    await ctx.markFailed(err);
    await notifyFailure(ctx, err);
    throw err;
  }
}
```

**Crash-resume:** every step updates `cloneJobs.currentStep` before returning. On re-pickup, `isDone(step)` checks `currentStep` ordering and skips already-completed steps.

### Created book linkage

`stepCreateBook` writes a new `books` doc (using existing book-creation logic) and stores its id on `cloneJobs.resultBookId`. No write to the `books` model itself — the link is `cloneJob → book` only. To go *book → source* requires a `cloneJobs where resultBookId == X` query (rare path, used only on a detail page).

---

## Telegram notifications

### Channels

Two pre-existing chat ids supplied by the operator:

```
TELEGRAM_BOT_TOKEN=...
TELEGRAM_SUCCESS_CHAT_ID=-100...
TELEGRAM_FAIL_CHAT_ID=-100...
ADMIN_BASE_URL=https://admin.example.com
```

### Message formats

```
✅ Book cloned
Source: 057_Brazilian_LDC_FestaJunina
Brand:  Búsqueda y Plática
Pages:  24
Took:   12m 03s
Book:   {ADMIN_BASE_URL}/books/<bookId>
```

```
❌ Clone failed
Source: 057_Brazilian_LDC_FestaJunina
Step:   extract-entities  (5/5 attempts)
Error:  RESOURCE_EXHAUSTED: Quota exceeded for gemini-2.5-pro
Retry:  {ADMIN_BASE_URL}/clone?job=<jobId>
```

Sent via direct `POST https://api.telegram.org/bot<TOKEN>/sendMessage` with `parse_mode: MarkdownV2`. Dynamic values escaped via a small `escapeMd()` helper. **Notification failures are logged but never throw** — the job's success/failure state is the Firestore record, not the Telegram send.

---

## Observability + recovery

- **`retryHistory[]` on `cloneJobs`** powers the Queue UI's retry-count column without log scraping.
- **Worker logs (`pino`, JSON)** tagged with `cloneJobId`, `sourceBookId`, `step`, `attempt`.
- **`bull-board`** mounted at `/api/admin/queue` behind the existing Firebase auth — native pause/resume/retry UI without building it.
- **Boot reconciler** in `apps/worker/src/reconciler.ts`: on worker start, query `cloneJobs where status in ['queued','running'] and updatedAt < now()-15m` and re-enqueue. Covers (a) Vercel-Firestore-committed-but-Redis-down, (b) worker died mid-step.

---

## Env vars

| Var | Required | Used by | Notes |
|---|---|---|---|
| `REDIS_URL` | yes | worker, admin | BullMQ connection |
| `TELEGRAM_BOT_TOKEN` | yes | worker | bot token from @BotFather |
| `TELEGRAM_SUCCESS_CHAT_ID` | yes | worker | success channel id |
| `TELEGRAM_FAIL_CHAT_ID` | yes | worker | failure channel id |
| `ADMIN_BASE_URL` | no | worker | deep links in TG messages; falls back to no-link |
| Existing Firebase / R2 / LLM provider vars | yes | both | reused, unchanged |

Worker boot fail-fast on missing required (zod-validated).

---

## Testing

| Layer | What | Where |
|---|---|---|
| Unit | `withRetry` backoff math, jitter, `isRateLimitError` | `packages/clone-core/src/retry.test.ts` |
| Unit | CSV parser → row mapping, invalid-row detection, dedupe split | `apps/admin/src/app/api/clone/import-csv/route.test.ts` |
| Unit | Telegram MarkdownV2 escaper + formatters | `apps/worker/src/notify/format.test.ts` |
| Integration | One `processCloneJob` against a fixture PDF with mocked LLM (step ordering, currentStep persistence, crash-resume) | `apps/worker/src/processor/clone-job-processor.test.ts` |
| Integration | Import endpoint dryRun vs commit against Firestore emulator | `apps/admin/.../import-csv/route.integration.test.ts` |
| Manual | One CSV row end-to-end on staging Redis + staging TG channels | runbook (below) |

LLM calls are mocked in integration tests. Real rate-limit behavior and real Telegram delivery are covered by the staging runbook only.

---

## Manual staging runbook

1. Set staging env vars (separate Redis, separate TG channels).
2. Boot worker: `yarn workspace @vx/worker start`.
3. Upload `samples/one-row.csv` via Import tab.
4. Confirm: `sourceBooks/<id>` and `cloneJobs/<jobId>` appear; job picked up by worker within 5s.
5. Watch worker logs + Queue tab; expect 6 steps, one TG success message.
6. Force-fail: temporarily set `TELEGRAM_BOT_TOKEN` to garbage and re-run — verify TG-send failure logs but Firestore state is correct + worker continues.
7. Force-rate-limit: point analyze step at a throttled endpoint, verify exp-backoff retry sequence in `retryHistory[]`.

---

## Out of scope (later)

- Per-source-book listing of all derivative books on a "Source detail" page.
- Cancel-in-flight (current Cancel only marks queued jobs cancelled; running ones complete the current step first).
- Auto-pause queue when failure rate exceeds threshold.
- Backfill: importing the existing manual clone jobs into `sourceBooks`.

---

## Open questions

None at design freeze. (CSV row semantics, dedupe rule, retry policy, channel setup, source↔book linkage, and queue runtime all confirmed during brainstorming.)
