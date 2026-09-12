-- CloneJob.sourceBookId backfill (2026-09-12)
--
-- WHY: cột "sourceBookId" và index của nó đã có trong schema từ lâu nhưng route
-- import chỉ ghi giá trị vào data->>'sourceBookId', nên cột NULL trên toàn bộ
-- 2198 rows. Đổ giá trị sang cột để Prisma nối được quan hệ thật tới SourceBook
-- và lọc jobs theo niche/priority bằng join có index.
--
-- AN TOÀN: đã kiểm tra trên prod — 0 bản ghi có data->>'sourceBookId' trỏ tới
-- một SourceBook không tồn tại, nên foreign key mà `prisma db push` tạo ra sau
-- đó sẽ không vi phạm ràng buộc.
--
-- CHẠY TRÊN PROD TRƯỚC KHI DEPLOY:
--   psql "$DIRECT_URL" -f packages/db/prisma/clonejob-sourcebook-2026-09.sql
--
-- Idempotent: chạy lại chỉ không khớp row nào nữa.
UPDATE "CloneJob"
SET "sourceBookId" = data->>'sourceBookId'
WHERE "sourceBookId" IS NULL
  AND data->>'sourceBookId' IS NOT NULL;
