-- Book.priority denormalization (2026-09-12)
--
-- Mở rộng book_denorm_perf (xem books-denorm-2026-08.sql) để cõng thêm
-- data.priority, phục vụ filter priority trên trang Books bằng btree thay vì
-- JSONB path scan. Trigger hiện đã fire trên UPDATE OF "data" nên không cần
-- định nghĩa lại trigger, chỉ thay thân function.
--
-- CHẠY TRÊN PROD TRƯỚC KHI DEPLOY:
--   psql "$DIRECT_URL" -f packages/db/prisma/book-priority-2026-09.sql
-- Không dùng --single-transaction.

ALTER TABLE "Book" ADD COLUMN IF NOT EXISTS "priority" text;

CREATE OR REPLACE FUNCTION book_denorm_perf() RETURNS trigger AS $$
BEGIN
  NEW."interiorPages" := jsonb_array_length(COALESCE(NEW."coloringPages", '[]'::jsonb));
  NEW."niche"    := NULLIF(NEW."data" ->> 'niche', '');
  NEW."priority" := NULLIF(NEW."data" ->> 'priority', '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Seed cho rows viết trước khi cột tồn tại. Idempotent.
UPDATE "Book" SET "priority" = NULLIF("data" ->> 'priority', '');
