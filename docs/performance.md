# Performance Optimization Guide

Single source of truth for the data-load performance work on this app: **what is
already optimized** (so it isn't accidentally undone), the **moving parts that
need operational care**, and the **backlog of what to improve next**.

- Chronological, per-round detail lives in [`/PERFORMANCE-REVIEW.md`](../PERFORMANCE-REVIEW.md).
- This guide is the forward-looking reference — start here when picking up more perf work.

Last major pass: **2026-08-20** (rounds 2–5 + prod deploy). Prod is small today
(~122 books, ~2200 clone jobs), so most costs are latent — they bite as data grows.

---

## The core lesson

The first perf pass (round 1) only trimmed **payload weight** (omit heavy JSON
columns). Loads still felt slow because the real cost was at the **database
layer**: list queries did **full sequential scans + unindexed sorts**, and two
book filters used **JSONB-path predicates** that can't use a btree index. Payload
size ≠ query time. When something "still feels slow after optimization", measure
the **DB query plan and the count()**, not just the response size.

---

## ✅ What is already optimized (do not undo)

### 1. Database indexes (`packages/db/prisma/schema.prisma`)

Every list `orderBy`/filter column is indexed. Key ones:

| Model | Index | Serves |
|---|---|---|
| Book | `[createdAt]`, `[isPublic, createdAt]`, `[assignedToId, createdAt]` | list sort + default/operator filters (index-ordered walk, early LIMIT stop) |
| Book | `[isPublic, interiorPages]` | default "Interior > 40" view incl. its `count()` |
| Book | GIN `[coloringPages]` | coloring-style **usages** route (`@>` containment) |
| CloneJob | `[status, createdAt]` + `[status, updatedAt]` | queue tabs (createdAt) + terminal tabs reproduced/error (updatedAt) |
| User / Purchase / Font / CoverTextOverlay | `[createdAt]` | list sort |
| Wallet | `[updatedAt]`, ArtStyle/Location | `[name]` | list sort |

**Why it matters:** removing any of these silently reverts a table to a full
scan/sort. If you add a new list `orderBy`/`where` column, add the matching index.

### 2. Denormalized book columns via a DB trigger ⚠️ operational

`Book.interiorPages` (= `jsonb_array_length(coloringPages)`) and `Book.niche`
(= `data.niche`) are **scalar columns maintained by a Postgres trigger**
(`book_denorm_perf`, defined in `packages/db/prisma/books-denorm-2026-08.sql`).
The books list filters "interior > 40" and searches niche on these **indexed
columns** instead of a JSONB-path scan.

- **Prisma only reads/filters these columns — never writes them.** The trigger is
  authoritative, so `prisma db push` stays conflict-free and no app write-site has
  to keep them in sync (the interior count changes at ~7 write sites).
- **The trigger is NOT created by `deploy.sh`** (Prisma doesn't manage triggers).
  It is applied by running the SQL manually. **If the prod DB is ever wiped/
  recreated, re-apply `books-denorm-2026-08.sql`** or these columns go NULL and the
  default books view returns empty.

### 3. Cached clone-job status counts (`packages/db/src/clone-status-counts.ts`)

`/api/clone` badge counts come from a `CloneJobStatusCount` cache table via
`readCloneJobStatusCounts`, recomputed **lazily at most once per 60s** (a full
`groupBy` used to run on every request). Design is **recompute-only** (no
per-mutation bumps) — bumps broke the `every(row stale)` staleness check. Badges
can lag ≤60s; that's an accepted trade. `syncCloneJobStatusCounts` zeroes emptied
statuses.

### 4. Payload trimming

- **List routes** omit heavy JSON: `/api/books` omits `coloringPages`/`summaryPages`;
  `/api/clone` omits `pages`/`bookData` (round 1).
- **Clone detail** supports `?lite=1` (drops per-page `rawData` + bookData/entityMap)
  for thumbnail-only consumers; `/api/clone/[jobId]/status` is a tiny select-only
  progress payload.

### 5. Client data-fetching (`packages/coloring/src/data/*`)

- Global React Query defaults are healthy: `staleTime` 5m, `gcTime` 30m,
  `refetchOnWindowFocus: false`, `retry: 1` (`packages/core-uikit/src/api`).
- **Polling is gated, not constant.** The always-mounted generation-queue drawer
  polls fast (4s) **only while open + active**, gentle (20s) when active+closed,
  and **not at all when idle** (enqueue sites invalidate the query to wake it) —
  see `generationPollInterval`. The clone-job detail poll hits the light `/status`
  endpoint and only refetches the full job when `status`/`analyzedPages` change.
- **Filters run server-side**: books `interior`/`niche`/`assignee`/`etsy` are all
  server params (no fetch-all-then-filter). The Etsy screen server-filters to the
  listed subset (fixed a 60-cap correctness bug).
- The two `useOperators` hooks share one query key (`["coloring","operators"]`) —
  fetched once, cached. Any mutation must invalidate that key
  (`use-operator-actions.ts`).

### 6. Rendering (`packages/coloring/src/screens/*`)

- Thumbnails go through the Cloudflare resizer `thumbImg(url, width)` + `loading="lazy"`
  (classify grid, compare strip, cover-editor bg, book grids) — never full-res
  originals shrunk by CSS. Use full-res `resolveImg` only for lightbox/canvas.
- Page grids are `React.memo`'d with **stable callbacks** (classify, batch-select)
  so toggling one page doesn't re-render every tile.

---

## 🔧 Operational notes (moving parts)

1. **Deploy order for schema changes touching the trigger/columns:** run the SQL
   **before** `prisma db push`. `deploy.sh` runs `db push` on the server (step 3)
   but does NOT run the trigger/backfill SQL. Correct order:
   ```
   # apply columns + trigger + backfill to prod (idempotent), THEN deploy
   ssh ec2-user@3.216.170.208 "docker exec -i vx-postgres psql -U postgres -d coloring -v ON_ERROR_STOP=1" \
     < packages/db/prisma/books-denorm-2026-08.sql
   bash deploy.sh
   ```
   (The `perf-indexes-2026-08.sql` CONCURRENTLY file is optional on today's small
   tables — `db push` creates those indexes fine; keep it for when tables grow.)
2. **`interiorPages`/`niche` are derived** — never write them from app code. To
   change what they mean, edit the trigger, not the query.
3. **Counts cache self-heals every 60s.** If you need sub-60s freshness, see the
   backlog item below (don't naively re-add bumps).
4. **Niche coverage:** `yarn workspace @vx/worker backfill:niche --apply` populates
   `data.niche` from lineage for books missing it; the trigger then fills the column.

---

## 🚧 Backlog — what to improve next (prioritized)

Each item: **why it was deferred**, the **signal to pick it up**, a **sketch**, and
**risk**. Ordered by expected value-when-triggered.

### P1 — Book-detail payload split by tab
- **Why deferred:** the default "info" tab itself renders `coloringPages`
  thumbnails, so the ~130KB payload is genuinely needed on open. A clean split
  needs a UX change (move page thumbnails off the default tab).
- **Pick up when:** books routinely exceed ~60 interior pages and detail open feels
  heavy, OR the info tab is redesigned.
- **Sketch:** `/api/books/[bookId]?lite=1` (scalars + `data`, no `coloringPages`)
  for header/info; lazy-load `coloringPages` only when the pages tab activates.
- **Risk:** medium — central screen; derived arrays (`pages`, `colored`,
  `coverCandidates`) must tolerate `coloringPages` being absent until loaded.

### P2 — True grid virtualization (`@tanstack/react-virtual`)
- **Why deferred:** grids are book-size-bounded and interactive (selection state);
  `React.memo` + `lazy` capture the practical win at today's sizes. 2D auto-fill
  selection-grid virtualization is fiddly and regression-prone.
- **Pick up when:** books commonly have 150+ pages and the classify/compare/batch
  grids visibly jank on scroll.
- **Sketch:** virtualize the compare strip first (1D, easiest); then the classify
  and batch grids. Preserve keyboard/selection.
- **Risk:** medium-high — easy to break selection UX.

### P3 — `useEntityList` server pagination + search
- **Why deferred:** entity tables (characters, locations, art-styles, coloring-
  styles, brands, categories) are small; the hook fetches the whole table and the
  screen filters/tabs/counts client-side. The route (`lib/list-query.ts`) already
  supports `page`/`limit`/`q`.
- **Pick up when:** any entity table crosses a few hundred rows (coloring-styles is
  the likely first, and it ships heavy `variants`/`referenceImages` per row).
- **Sketch:** have `useEntityList` send `page`/`limit`/`q`; move tab counts to the
  server or drop the numeric badges; add a lighter list projection for coloring-
  styles (swatch-only), fetch full `variants` on detail.
- **Risk:** medium — the shared entity-list screen drives many entity types.

### P4 — `useFonts` → React Query
- **Why deferred:** small font table; the hook is hand-rolled `useState`+`useEffect`
  so `font-picker` remounts (common in the cover editor) refetch `/fonts`. Its test
  would need a `QueryClientProvider` wrapper.
- **Pick up when:** the cover editor's repeated `/fonts` fetches show up, or fonts grow.
- **Sketch:** `useQuery(["coloring","fonts"], fetchFonts)`; run `injectFontFaces` in
  an effect on the data. Wrap the co-located test in a QueryClientProvider.
- **Risk:** low.

### P5 — Drop heavy `data`/`elements` JSON from admin list routes
- **Why deferred:** wallets/purchases/credit-ledger/cover-text-overlays are tiny,
  low-traffic admin tables; dropping the columns risks breaking consumers for
  negligible bytes, and needs per-consumer verification.
- **Pick up when:** any of these tables grows or a screen is confirmed not to read
  `data`.
- **Sketch:** add `select` projections omitting `data` (and `elements` for cover-
  text-overlays) after verifying the consuming screen.
- **Risk:** low-medium (consumer breakage).

### P6 — Sub-60s badge freshness (counts cache real-time)
- **Why deferred:** ≤60s drift is fine for dashboard badges, and naive bumps break
  the staleness check.
- **Pick up when:** operators need live per-status counts.
- **Sketch:** re-introduce bumps at status-write sites AND track "last full
  recompute" in a **dedicated marker row** (not per-status `updatedAt`) so staleness
  detection stays correct. Consider a Prisma `$extends` query hook to catch all
  `cloneJob` mutations in one place.
- **Risk:** medium — ~20 scattered status-write sites; get the from→to right.

### P7 — Trigram search for niche/title (`pg_trgm`)
- **Why deferred:** niche is now a scalar column (no JSON detoast), but `contains`
  substring search still can't use a btree index — it's a scan over a narrow column
  (cheap today).
- **Pick up when:** book search is hot and slow on a large library.
- **Sketch:** `CREATE EXTENSION pg_trgm` + GIN `gin_trgm_ops` indexes on
  `Book.niche`/`title`/`subtitle`; the `ILIKE '%q%'` queries then use the index.
- **Risk:** low (additive), but adds a DB extension.

### P8 — Denormalize `hasEtsyListing`
- **Why deferred:** the Etsy screen is low-traffic; its server filter uses a JSONB
  path (`data.etsyListing not null`) which is acceptable there.
- **Pick up when:** the Etsy screen becomes hot or the library is large.
- **Sketch:** add a `hasEtsyListing boolean` scalar maintained by the same
  `book_denorm_perf` trigger (`NEW.data ? 'etsyListing'`), index it, filter on it.
- **Risk:** low (follows the existing trigger pattern).

### P9 — `generationJob` Redis reconciliation (pre-existing)
- **Why deferred:** `generationJob` rows don't auto-recover after a Redis-down
  enqueue; the reconciler only handles `cloneJob`, and the 503 message over-promises.
- **Pick up when:** background-gen jobs are seen stuck `pending` after a Redis blip.
- **Sketch:** extend the reconciler to re-enqueue orphaned `pending` generationJobs;
  fix the 503 copy.
- **Risk:** medium (queue semantics).

---

## How to continue (methodology)

1. **Measure first.** For a slow screen, look at the DB query plan and whether a
   `count()` (unbounded) or a JSONB-path predicate is in the hot path — not just the
   payload size. Prod is small, so reproduce with realistic row counts.
2. **Fan out the audit.** The 2026-08 pass ran parallel finders over four areas
   (API/DB routes, client hooks, heavy detail screens, secondary screens),
   cross-referenced against the schema, then verified each finding against real code
   before acting.
3. **Prefer the deepest correct fix**, but weigh deploy risk: additive indexes and
   DB triggers are low-risk and don't touch app write paths; central-screen
   refactors and DB extensions deserve their own tested cycle.
4. **Record the round** in `/PERFORMANCE-REVIEW.md` (what/why/deploy steps) and
   update this guide's Done/Backlog sections.
