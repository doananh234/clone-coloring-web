# Lịch sử task đã xong

## 2026-09-21 — Clone jobs: search mượt + search server-side + lọc nguồn
- Search jobs chạy server-side (tên/id/nguồn `data.brand`, không phân biệt hoa thường); trước chỉ lọc 50 dòng trang hiện tại. Spec: `docs/superpowers/specs/2026-09-21-jobs-search-source-design.md`.
- Input debounce qua hook `useDebouncedInput` (dùng chung với books-screen), sửa race mất ký tự.
- Dropdown "Mọi nguồn" từ `/api/clone/facets` (`sources`, 83 nguồn lúc deploy). Nếu nhiều hơn nhiều → cân nhắc Combobox.
- Merge `52e02fb`, deploy prod 2026-09-21, đã probe API trên server (COCO → 90 job).
