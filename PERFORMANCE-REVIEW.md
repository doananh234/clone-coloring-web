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
