# Task hiện tại: Đếm trang sách nguồn + tab "Sách thiếu trang"

Branch: `feat/source-page-count`. Spec: `docs/superpowers/specs/2026-09-23-source-page-count-design.md` (user duyệt 2026-09-23).

## Các bước

- [x] 1. `countPdfPages` (server-core, tách bộ nạp pdfjs dùng chung) + `MIN_SOURCE_PAGES`/`isInsufficientSourcePages` + status `insufficient-pages` (clone-core) + test
- [x] 2. Chặn trong pipeline: sau `stepRender`, dưới ngưỡng → status `insufficient-pages`, dừng trước mọi call AI + test
- [x] 3. UI: tab "Sách thiếu trang" trong `STATUS_TABS` + nhãn trong `STATUS_META`
- [x] 4. Script `apps/worker/src/scripts/count-source-pages.ts` (dry-run mặc định, `--apply`, `--limit`) + test phần thuần
- [ ] 5. Verify (test + tsc) → user review → merge/deploy → chạy dry-run rồi `--apply` trên prod

## Đã chốt

- Trạng thái riêng `insufficient-pages`, không tái dùng `awaiting-fill` (tính năng cũ bị 4e1026f xoá, có thể khôi phục sau).
- Ngưỡng là hằng số trong code (user chọn), tab chỉ để xem, script chạy tay.

## Lưu ý cho agent tiếp theo

- PDF nguồn 27–38 MB, tải từ S3 về EC2 ~1s/file (cùng vùng us-east-1). Đừng đếm trang inline trong request import: 379 file ≈ 6–7 phút → Cloudflare cắt ở 100s.
