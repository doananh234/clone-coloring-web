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
