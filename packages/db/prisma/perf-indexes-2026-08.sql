-- Performance indexes — round 2 (2026-08-20)
--
-- WHY: the round-1 perf pass (see /PERFORMANCE-REVIEW.md) trimmed payload weight
-- but left the list queries doing full sequential scans + unindexed sorts, so DB
-- time was unchanged. These indexes cover the list orderBy/filter columns so the
-- books / clone-jobs / users / purchases lists use index scans instead.
--
-- HOW TO APPLY (prod = self-hosted Postgres): run this file with psql BEFORE the
-- next `prisma db push`. Using CREATE INDEX CONCURRENTLY avoids the table-level
-- write lock that `db push` (plain CREATE INDEX) would take on large tables.
--
--   psql "$DIRECT_URL" -f packages/db/prisma/perf-indexes-2026-08.sql
--
-- Notes:
--   * CONCURRENTLY cannot run inside a transaction — do NOT wrap in BEGIN/COMMIT
--     and do NOT pass psql --single-transaction.
--   * Index names match Prisma's auto-naming, so the subsequent `prisma db push`
--     sees them as already-present and does nothing (no second, blocking build).
--   * IF NOT EXISTS makes this idempotent / safe to re-run.
--   * If a CONCURRENTLY build fails midway it leaves an INVALID index — drop it
--     ("DROP INDEX CONCURRENTLY <name>") and re-run that one line.

-- Book: list orders by createdAt desc; default view filters isPublic, non-admins
-- filter assignedToId. Composite indexes give sorted walk + early LIMIT stop.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Book_createdAt_idx"
  ON "Book" ("createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Book_isPublic_createdAt_idx"
  ON "Book" ("isPublic", "createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Book_assignedToId_createdAt_idx"
  ON "Book" ("assignedToId", "createdAt");
-- coloring-styles usages route matches books via coloringPages @> [{styleId}].
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Book_coloringPages_idx"
  ON "Book" USING gin ("coloringPages");

-- CloneJob: list filters by status; queue tabs sort createdAt, terminal tabs
-- (reproduced/error) sort updatedAt. status-only filters use the leftmost prefix.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CloneJob_status_createdAt_idx"
  ON "CloneJob" ("status", "createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CloneJob_status_updatedAt_idx"
  ON "CloneJob" ("status", "updatedAt");

-- User / Purchase lists order by createdAt desc.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_createdAt_idx"
  ON "User" ("createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Purchase_createdAt_idx"
  ON "Purchase" ("createdAt");

-- Secondary admin lists: sort columns that were unindexed.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Wallet_updatedAt_idx"
  ON "Wallet" ("updatedAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Font_createdAt_idx"
  ON "Font" ("createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CoverTextOverlay_createdAt_idx"
  ON "CoverTextOverlay" ("createdAt");
-- Entity lists (art-styles, locations) order by name (list-query.ts).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ArtStyle_name_idx"
  ON "ArtStyle" ("name");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Location_name_idx"
  ON "Location" ("name");

-- The old single-column "Book_assignedToId_idx" is superseded by the composite
-- above (leftmost prefix covers equality lookups). Drop it AFTER verifying the
-- composite exists, to reclaim write overhead:
--   DROP INDEX CONCURRENTLY IF EXISTS "Book_assignedToId_idx";
-- Likewise the old "CloneJob_status_idx" is covered by CloneJob_status_createdAt_idx:
--   DROP INDEX CONCURRENTLY IF EXISTS "CloneJob_status_idx";
