# Task hiện tại: Clone xong không tự làm cover — bìa sách = bìa sách gốc

Branch: `feat/clone-keep-source-cover`. User đã duyệt thiết kế (2026-09-22), chọn C: bỏ luôn generate-book-meta.

## Các bước

- [x] 1. Helper chọn trang bìa gốc `pickSourceCoverPage` (clone-core) + `create-book` dùng `imageUrl` của nó cho cover/thumbnail/squareThumbnail, seed `coverMeta.sourceThumbnailUrl` + test
- [x] 2. Worker `clone-job-processor.ts`: bỏ gọi generate-cover / generate-book-meta / finalize-cover (GIỮ `STEP_ORDER`) + test
- [x] 3. Route tạo tay `apps/admin/src/app/api/clone/[jobId]/create-book/route.ts`: đặt coverUrl bằng bìa gốc + test
- [x] 4. Script backfill `apps/worker/src/scripts/backfill-source-cover.ts` (dry-run mặc định, `--apply`, lưu URL cũ vào `data.coverBeforeSourceBackfill` để rollback)
- [ ] 5. Verify (test + tsc) → user review → merge/deploy → chạy backfill dry-run trên prod, báo số liệu, CHỜ user duyệt mới `--apply`

## Đã chốt

- Giữ `STEP_ORDER` nguyên: `isDone()` dựa vào index; xoá tên bước làm job cũ (currentStep=generate-cover) chạy lại create-book → sách trùng.
- Giữ code 3 step trong clone-core (không gọi) để có thể gắn nút tay sau.
- Bìa phải COPY sang `assets/{bookId}/` vì ảnh `assets/clone-jobs/{jobId}/` là tạm, bị dọn.
- Fallback khi không có trang pageType=cover: trang nguồn đầu tiên không excluded (theo pageNumber).
- Backfill KHÔNG lưu `coverBeforeSourceBackfill`: thay vào đó giữ bìa cũ thành Cover Candidate (origin "source" → nhãn "Ban đầu"), thêm candidate origin "original" ("Bìa gốc") và chọn nó → rollback bằng UI. Ảnh copy vào `assets/{bookId}/source-cover.*` (không đè `cover.png` = bìa AI của finalize-cover).

## Lưu ý cho agent tiếp theo

- Backfill ghi prod: chạy bằng `docker exec vx-worker /app/node_modules/.bin/tsx ...` (KHÔNG `yarn backfill:*` — .env cũ trong image). Có sách user đã tự chọn bìa (Cover candidates / cover editor) → hỏi user phạm vi trước khi apply.
