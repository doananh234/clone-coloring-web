-- Books denormalization — interiorPages + niche scalar columns (2026-08-20)
--
-- WHY: the books list default view filters `interior > 40` and searches niche.
-- Both were JSONB-path predicates (data.specifications.pages / data.nicheLower)
-- which cannot use a btree index -> sequential scan + per-row jsonb detoast, and
-- the count() over that predicate was the residual latency after the createdAt
-- indexes. These scalar columns move the filter onto indexable columns.
--
-- HOW IT STAYS CORRECT: a BEFORE INSERT/UPDATE trigger recomputes both columns
-- from coloringPages / data on every write, so NO application code has to keep
-- them in sync (the interior count changes at ~7 different write sites). Prisma
-- only ever reads/filters these columns — it never writes them — so the trigger
-- is authoritative and `prisma db push` stays conflict-free.
--
-- APPLY ON PROD (self-hosted Postgres) BEFORE `prisma db push`:
--   psql "$DIRECT_URL" -f packages/db/prisma/books-denorm-2026-08.sql
-- Do NOT pass --single-transaction (CREATE INDEX CONCURRENTLY can't run in a txn).
-- Optional first: `yarn backfill:niche --apply` (worker) to populate data.niche
-- for older books so the niche column has values to copy.

-- 1. Columns (nullable, no default -> instant, no table rewrite). Match the
--    Prisma model so the later `db push` sees them as already present.
ALTER TABLE "Book" ADD COLUMN IF NOT EXISTS "interiorPages" integer;
ALTER TABLE "Book" ADD COLUMN IF NOT EXISTS "niche" text;

-- 2. Trigger keeps the columns in sync with the source-of-truth JSON columns.
--    interiorPages = number of interior pages (coloringPages array length).
--    niche         = data.niche (empty string normalized to NULL).
CREATE OR REPLACE FUNCTION book_denorm_perf() RETURNS trigger AS $$
BEGIN
  NEW."interiorPages" := jsonb_array_length(COALESCE(NEW."coloringPages", '[]'::jsonb));
  NEW."niche" := NULLIF(NEW."data" ->> 'niche', '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS book_denorm_perf_trg ON "Book";
CREATE TRIGGER book_denorm_perf_trg
  BEFORE INSERT OR UPDATE OF "coloringPages", "data" ON "Book"
  FOR EACH ROW EXECUTE FUNCTION book_denorm_perf();

-- 3. One-time backfill for existing rows. The trigger maintains new writes; this
--    seeds the columns for rows written before the trigger existed. Idempotent
--    (re-running just recomputes the same values). For very large tables, run in
--    id batches instead of one statement to avoid a long row-lock sweep.
UPDATE "Book" SET
  "interiorPages" = jsonb_array_length(COALESCE("coloringPages", '[]'::jsonb)),
  "niche" = NULLIF("data" ->> 'niche', '');

-- 4. Index for the default view (isPublic + interiorPages > 40, incl. count()).
--    CONCURRENTLY + Prisma-matching name so `db push` treats it as present.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Book_isPublic_interiorPages_idx"
  ON "Book" ("isPublic", "interiorPages");

-- Optional (only if niche search becomes hot): a pg_trgm GIN index makes the
-- case-insensitive `niche ILIKE '%q%'` search index-backed. Needs the extension:
--   CREATE EXTENSION IF NOT EXISTS pg_trgm;
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "Book_niche_trgm_idx"
--     ON "Book" USING gin ("niche" gin_trgm_ops);
