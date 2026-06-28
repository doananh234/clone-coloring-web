# Clone Worker Runbook

Operator guide for the BullMQ clone worker that processes CSV-imported source books end-to-end.

## Architecture (quick recap)

```
admin (Next.js)  ──enqueue──▶  Redis (BullMQ "clone-jobs")  ──pop──▶  worker (apps/worker)
       │                                                                    │
       └─ writes sourceBooks + cloneJobs (Firestore) ──────────── reads ────┘
                                                                             │
                                                                             ├──▶ R2 (PDFs, page images)
                                                                             ├──▶ LLM provider (analyze, generate)
                                                                             ├──▶ Telegram (success / fail)
                                                                             └──▶ books (Firestore)
```

Concurrency is hard-coded to **1** (FIFO). Each job runs steps `download → render → analyze → extract-entities → reproduce → create-book`. Each step retries with exponential backoff (10s → 160s, max 5 attempts) and a 5s cool-down between successful steps.

## Local dev

```
# 1. Redis
docker run -d -p 6379:6379 redis:7

# 2. Worker
cp apps/worker/.env.example apps/worker/.env
# Fill REDIS_URL, TELEGRAM_*, FIREBASE_SERVICE_ACCOUNT_JSON, R2_*, LLM creds
yarn workspace @vx/worker dev

# 3. Admin (separate terminal)
yarn workspace @vx/admin dev
```

Visit `/clone` → "Import CSV" tab, upload a small CSV, watch the Queue tab tick.

## Production boot

The worker container is built from `apps/worker/Dockerfile`. Run as a single instance with concurrency=1 (do not scale horizontally — the global queue assumes one consumer).

```
docker build -f apps/worker/Dockerfile -t vx-worker .
docker run --env-file apps/worker/.env vx-worker
```

## Operator actions

| Action | How |
|--------|-----|
| Pause the queue | Queue tab → "Pause queue", or `POST /api/clone/queue/pause` |
| Resume the queue | Queue tab → "Resume queue", or `POST /api/clone/queue/resume` |
| Retry a failed job | Queue tab → row with `error` status → "Retry" button, or `POST /api/clone/<jobId>/retry` |
| Inspect queue state | `GET /api/admin/queue` (Bearer Firebase ID token in `Authorization`) |
| Tail worker logs | `pino` JSON; filter by `cloneJobId` or `step` field |

## Smoke test (single CSV row)

1. Create `samples/one-row.csv` with header + one valid row (see CSV header spec below).
2. Upload via `/clone` → Import CSV. Confirm dry-run preview: 1 new, 0 dup, 0 invalid.
3. Click "Import 1 jobs".
4. Open Queue tab. Watch `currentStep` advance: `download → render → analyze → extract-entities → reproduce → create-book`.
5. On terminal state:
   - **Success:** Telegram message in `TELEGRAM_SUCCESS_CHAT_ID`, `cloneJobs.<id>.status == "reproduced"`, `resultBookId` set, book visible in `/books`.
   - **Failure:** Telegram message in `TELEGRAM_FAIL_CHAT_ID`, `cloneJobs.<id>.status == "error"`, `failedStep` populated.

## CSV header

```
_id, fileName, fileSize, topicName (Brand), thumbnailUrl, thumbnailPreview, book url, Select, Remove, Niche, Priority
```

- `_id` doubles as the Firestore `sourceBooks` doc id — dedupe is by collision on this value.
- `book url` must be reachable from the worker (HTTP GET, no auth).
- `Select` / `Remove` are mirrored to `sourceBooks.selectedInCsv` for traceability but **not** used to filter imports.

## Crash recovery

On worker boot, the reconciler scans `cloneJobs where status in ['queued','running'] and updatedAt < now()-15m` and re-enqueues each. Within a job, `cloneJobs.<id>.currentStep` lets the processor skip already-completed steps on re-pickup.

## Firestore indexes

Deploy required composite indexes once per environment:

```
firebase deploy --only firestore:indexes
```

The two indexes live in `firestore.indexes.json` at the repo root:
- `cloneJobs (sourceBookId asc, status asc)` — for "list derivative books of source X".
- `cloneJobs (status asc, updatedAt asc)` — for the reconciler.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Jobs queued but never picked up | Worker not running, or wrong `REDIS_URL` | Check worker logs; verify `REDIS_URL` matches admin's |
| Telegram silent | Bad token/chat id, or non-200 from api.telegram.org | Check worker logs — send is fail-safe and logs every miss |
| Repeated retries on `analyze` | LLM rate limit (`RESOURCE_EXHAUSTED`) | Expected — backoff resolves it. Reduce concurrency upstream or raise quota if persistent. |
| Stuck `running` job | Worker died mid-step | Reconciler picks it up on next boot. Manually requeue via `POST /api/clone/<jobId>/retry` for faster recovery. |
| Reproduced book missing pages | A `reproduce` page failed silently | Inspect `cloneJobs.<id>.pages[]` — pages without `redesignedUrl` were skipped. Retry the job. |
