# Performance Review — Summary / Jobs / Books lists

Date: 2026-07-27 · Scope: `/` (overview), `/jobs`, `/books` list loads (Motio admin).

## TL;DR
Loads were slow because the **books list returned every book's full `coloringPages`**
(30–47 pages × rich `sceneData`) — **2.7 MB for 20 books**. The list UI never uses that
data. Trimming heavy Json columns from the list endpoints cuts payloads ~90%, and the
jobs list is now paginated instead of fetching 200 rows.

## Measurements (before)
| Endpoint | Rows | Payload | Note |
|---|---|---|---|
| `GET /api/books?limit=20` | 20 | **2.7 MB** | full `coloringPages` per book (~130 KB/book) |
| `GET /api/books?limit=6` (overview) | 6 | 510 KB | same cause |
| `GET /api/clone?limit=200` | 200 | 106 KB | rows already lean client-side, but server fetched full `pages` json |

Caching was already fine (react-query `staleTime` 5 min, `gcTime` 30 min, no refetch-on-focus),
and books already had pagination (24/page). The bottleneck was **payload weight**, not caching or missing pagination.

## Root cause
- `app/api/books/route.ts` GET did `prisma.book.findMany()` with no projection → returned
  the heavy `coloringPages` + `summaryPages` Json columns the list never reads.
- `app/api/clone/route.ts` GET fetched full rows (incl. `pages` Json) then mapped to a lean
  shape — client payload was small but the DB read/transfer was heavy; also `limit` defaulted to 200.

## Fixes applied
1. **Books list** (`app/api/books/route.ts`): `findMany({ omit: { coloringPages: true, summaryPages: true } })`.
   Book **detail** (`/api/books/[id]`) still returns full `coloringPages` — detail view unaffected.
2. **Clone list** (`app/api/clone/route.ts`): `omit: { pages: true, bookData: true }` + added
   `page`/`skip` pagination (`?page=N&limit=L`, skip `(page-1)*limit`).
3. **Hooks**: `useCloneJobs(status, limit=50, page=1)` (was `limit=200`, no page); books hook unchanged (already paginated).
4. **Jobs UI** (`jobs-screen.tsx`): added `Pagination`, 50/page, resets to page 1 on tab change;
   local drafts only on page 1 of the "all" tab.

## Expected impact (after deploy)
| Endpoint | Before | After | Δ |
|---|---|---|---|
| Books list (20) | 2.7 MB | ~240 KB | **−91%** |
| Overview books (6) | 510 KB | ~50 KB | −90% |
| Jobs list | 106 KB (200 rows) | 28 KB (50 rows) | **−74%** |

Jobs `limit=50` already helps in dev (the live API respects `limit`); the books `omit`
and clone `page`/`skip` take effect once `new-admin-theme` is **deployed** to bookai
(dev proxies to the live API, which still runs the old routes).

## Verified
- Typecheck: `@vx/coloring` + `apps/admin` = 0 errors (Prisma 6.1 `omit` is GA).
- `GET /coloring-api/clone?limit=50` → 50 rows, 28 KB (vs 106 KB at 200).

## Optional follow-ups (not done)
- Server-side search for jobs/books (current search filters the loaded page only).
- Lean the books list further by also omitting `data`/`storyOutline` (kept for now to preserve
  `specifications.pages` / category on the card).
- Virtualize long tables if page sizes grow.

---

# Round 2 — DB indexes + polling (2026-08-20)

## Why round 1 didn't feel faster
Round 1 fixed **payload weight** (transfer), but the list queries still did **full
sequential scans + unindexed sorts**, so the DB time per load was unchanged. That's
the part users actually wait on.

## Fixes applied (this round)
1. **Indexes** (`packages/db/prisma/schema.prisma`; apply on prod via
   `packages/db/prisma/perf-indexes-2026-08.sql` — CONCURRENTLY, before `db push`):
   - `Book`: `[createdAt]`, `[isPublic, createdAt]`, `[assignedToId, createdAt]`, GIN `[coloringPages]`.
     Replaces the sequential scan + full sort behind the books list (main screen) with an
     index-ordered walk that early-stops at the page LIMIT.
   - `CloneJob`: `[status, createdAt]` + `[status, updatedAt]` — covers both the queue-tab sort
     (createdAt) and the terminal-tab sort (updatedAt, previously unindexed).
   - `User` / `Purchase`: `[createdAt]` for the list sort.
   - GIN `Book[coloringPages]` turns the coloring-style **usages** full-table `@>` scan into a lookup.
2. **Polling storm** (`packages/coloring/src/data/use-generation-jobs.ts`): the header queue
   drawer is mounted on every screen. It used to poll the full job list every 4s whenever any
   job was active (app-wide) and re-enabled `refetchOnWindowFocus`. Now: fast 4s only while the
   drawer is **open**, gentle 20s when active+closed, and **no poll when idle** (enqueue sites
   already invalidate `["coloring","generation-jobs"]` to wake it). Pure `generationPollInterval`
   helper is unit-tested.

## Deferred
_(none — the items below were completed in rounds 3–4.)_

---

# Round 3 — books filters: JSON→scalar via DB trigger (2026-08-20)

## Why
After round 2 the books `findMany` is index-fast, but the default view filters
`interior > 40` (`data.specifications.pages`) and searches niche (`data.nicheLower`)
— both JSONB-path predicates that can't use a btree index. The `count()` over that
predicate (run alongside findMany for pagination) still detoasted `data` for every
public row, so it was the residual latency.

## Fixes applied
- **Two denormalized scalar columns on `Book`** (`schema.prisma`): `interiorPages Int?`
  (= coloringPages length) and `niche String?` (= data.niche). Index `[isPublic, interiorPages]`.
- **A Postgres trigger maintains them** (`packages/db/prisma/books-denorm-2026-08.sql`):
  `book_denorm_perf` recomputes both on every INSERT/UPDATE of `coloringPages`/`data`. Chosen
  over app-side maintenance because the interior count changes at ~7 write sites (worker
  create-book, manual create route, reproduce, confirm, additional-pages append, generic PUT,
  page delete) — a trigger can't be forgotten at a new call site. Prisma only reads/filters
  these columns (never writes them), so `db push` stays conflict-free.
- **Books route** (`app/api/books/route.ts`): `interior=gt40` → `{ interiorPages: { gt: 40 } }`;
  search niche clause → `{ niche: { contains: q, mode: "insensitive" } }`. No more JSONB paths.

## Deploy steps (order matters)
1. `yarn workspace @vx/worker backfill:niche --apply` (optional — seeds `data.niche` for old books).
2. `psql "$DIRECT_URL" -f packages/db/prisma/perf-indexes-2026-08.sql`   (round-2 indexes)
3. `psql "$DIRECT_URL" -f packages/db/prisma/books-denorm-2026-08.sql`   (columns + trigger + backfill + index)
4. `yarn workspace @vx/db push`  (schema now matches the DB — a no-op for the above; picks up model fields)

Nuance: the filter now counts *actual* interior pages (coloringPages length) rather than a
possibly-hand-edited `data.specifications.pages`; for the "Interior > 40" filter that is the
more correct semantic.

---

# Round 4 — clone-job counts: wire the cache (2026-08-20)

## Why
`/api/clone` recomputed the per-status badge counts with a live `groupBy` (full-table
aggregate) on every counts request. A `CloneJobStatusCount` cache table + helpers
existed but were never called (dead code).

## Fixes applied
- **Wired `readCloneJobStatusCounts` into `/api/clone`** (`app/api/clone/route.ts`),
  replacing the live `groupBy`. Counts are now cached and recomputed lazily at most
  once per 60s (server-wide), so badges lag ≤60s instead of scanning per request.
- **Made the cache recompute-only** (`packages/db/src/clone-status-counts.ts`): removed
  the `bumpCloneJobStatusCount` / `transitionCloneJobStatus` helpers. They were a footgun
  — a recent bump made the `every(row stale)` staleness check false, so the cache would
  never recompute and would drift. Recompute-only keeps the staleness check correct with
  zero write-site instrumentation.
- **Fixed a latent recompute bug**: `syncCloneJobStatusCounts` now zeroes cached statuses
  that no longer have any jobs (previously an emptied status kept its stale count forever).
- Unit-tested (`clone-status-counts.test.ts`): zero-missing, empty/fresh/stale read paths.

## Deploy
No SQL/schema change — the `CloneJobStatusCount` table already exists. Ships with the app
deploy; the cache self-seeds on first read. (If sub-60s badge freshness is ever needed, add
bumps AND a dedicated "last recompute" marker row so staleness detection stays correct.)

---

# Round 5 — secondary screens: detail payloads, image thumbs, grids, filters (2026-08-20)

Phase 2 + 3 cleanup across the rest of the app (the two main lists were rounds 2–4).

## Backend
- **Remaining indexes** (`schema.prisma` + `perf-indexes-2026-08.sql`): `Wallet(updatedAt)`,
  `Font(createdAt)`, `CoverTextOverlay(createdAt)`, `ArtStyle(name)`, `Location(name)`.
- **Clone detail `?lite=1`** (`api/clone/[jobId]`): drops per-page `rawData` + bookData/entityMap
  for thumbnail-only consumers.
- **Clone status endpoint** (`api/clone/[jobId]/status`): tiny `select`-only progress payload.
- **Books filters** (`api/books`): server-side `assignee` (indexed scalar) + `etsy` (listed-only).

## Frontend
- **Detail poll no longer re-pulls the heavy body**: `use-clone-job` polls the light status
  endpoint while active and only refetches the full job when status/analyzedPages change.
- **Book-detail waterfall lightened**: "Sách gốc" section fetches the clone job in `lite` mode.
- **Image tiles → CDN thumbnails + lazy**: classify grid, compare strip, cover-editor bg strip
  (were full-res originals shrunk by CSS).
- **Re-render storms fixed**: `React.memo` + stable callbacks on the classify + batch-select
  page grids (toggling one page no longer re-renders all N tiles).
- **Etsy screen correctness**: server-filters to the listed subset, so the complete set is in
  hand (was capped at the first 60 raw books — listed books beyond that were unreachable).
- **Queue board**: assignee filtering moved server-side (indexed) — no more fetch-all-then-sift.
- **Operator list**: the two `useOperators` hooks now share one query key (was a double fetch).

## Deliberately NOT done (judged low-ROI / high-risk for this deploy)
- **Book-detail payload split by tab**: not viable — the default "info" tab itself renders
  coloringPages thumbnails, so the payload is needed on open (would require a UX restructure).
- **True grid virtualization** (react-virtual): these grids are book-size-bounded and interactive;
  memo + lazy captures the practical win without the regression risk of virtualizing selection UI.
- **`data`/`elements` JSON projections** on wallets/purchases/credit-ledger/cover-text-overlays:
  tiny admin tables; dropping the columns risks breaking consumers for negligible bytes.
- **`useEntityList` server pagination** + **`useFonts`→React Query**: entity/font tables are small;
  the refactors (central entity screen; test rewiring) aren't worth this deploy's risk. Revisit if
  those tables grow.

## Deploy
Apply the SQL (rounds 2 + 3 + 5 indexes) before `db push`, per the "Deploy steps" list above; the
round-5 index lines are appended to `perf-indexes-2026-08.sql`. Restart the dev server to pick up
the regenerated Prisma client.
