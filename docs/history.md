# Lịch sử task đã xong

## 2026-09-21 — Clone jobs: search mượt + search server-side + lọc nguồn
- Search jobs chạy server-side (tên/id/nguồn `data.brand`, không phân biệt hoa thường); trước chỉ lọc 50 dòng trang hiện tại. Spec: `docs/superpowers/specs/2026-09-21-jobs-search-source-design.md`.
- Input debounce qua hook `useDebouncedInput` (dùng chung với books-screen), sửa race mất ký tự.
- Dropdown "Mọi nguồn" từ `/api/clone/facets` (`sources`, 83 nguồn lúc deploy). Nếu nhiều hơn nhiều → cân nhắc Combobox.
- Merge `52e02fb`, deploy prod 2026-09-21, đã probe API trên server (COCO → 90 job).

## 2026-09-22 — Clone xong giữ bìa sách gốc, bỏ tự gen cover
- Worker dừng ở create-book: bỏ gọi generate-cover / generate-book-meta / finalize-cover (code + `STEP_ORDER` giữ nguyên vì `isDone()` dựa index). Bìa = ảnh gốc qua `pickSourceCoverPage` (clone-core); route tạo tay dùng cùng quy tắc.
- Candidate bìa: thêm origin "original" (nhãn "Bìa gốc"); "source" đổi nhãn thành "Ban đầu".
- Backfill `apps/worker/src/scripts/backfill-source-cover.ts` chạy prod 2026-09-22: 126 sách đổi, 8 bỏ qua (không có trang nguồn). Bìa cũ còn trong Cover Candidates để quay lại; ảnh ở `assets/{bookId}/source-cover.*`.
- Merge `ae6214b`, deploy prod 2026-09-22. Spec: thảo luận trong chat (không có file spec riêng).

## 2026-09-23 — Ảnh trắng toàn site: fallback khi CDN từ chối biến đổi ảnh
- Nguyên nhân: Cloudflare Image Transformations hết hạn mức miễn phí → mọi `/cdn-cgi/image/...` trả 429 `ERROR 9422`. Ảnh gốc trên R2 vẫn 200.
- Fix: `ImgCdnFallback` (listener 'error' pha capture trong `ColoringShell`) đổi ảnh CDN lỗi sang URL gốc, mỗi ảnh 1 lần; tự vô hiệu khi quota reset. Vá cả ~38 chỗ gọi `thumbImg()`.
- Merge `1063265`, deploy prod 2026-09-23.
- CÒN NỢ: hạn mức tính theo số ảnh biến đổi KHÁC NHAU mỗi tháng → backfill đổi hàng loạt URL ảnh rất tốn quota. Hướng xử lý triệt để: tự sinh thumbnail bằng `sharp` (đã có trong @vx/server-core) rồi bỏ CDN transform, hoặc bật gói trả phí Cloudflare.

## 2026-09-23 — Đếm trang sách nguồn + tab "Sách thiếu trang"
- `countPdfPages` (server-core, tách bộ nạp pdfjs dùng chung); `MIN_SOURCE_PAGES = 42` + status `insufficient-pages` (clone-core, `source-page-gate.ts`).
- Worker: gate ngay sau `stepRender`, trước mọi call AI. UI: tab "Sách thiếu trang".
- Script `count-source-pages.ts` chạy prod 2026-09-23 (~40 phút): 1355 job có số trang, **1045 job dưới 42 trang** chuyển sang `insufficient-pages`, 13 job lỗi tải PDF (S3 404/400) vẫn pending totalPages=0.
- Bẫy đã gặp: `new URL()` đã percent-encode path — encodeURIComponent thêm lần nữa làm S3 trả 404 cho mọi job (fix `8ff4a87`).
- Merge `dc9ddbe` + `fix/count-pages-url-encoding`, deploy prod 2026-09-23.
