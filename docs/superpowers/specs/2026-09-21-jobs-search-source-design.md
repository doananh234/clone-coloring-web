# Clone jobs: search mượt, search server-side, lọc theo nguồn

## Vấn đề

1. **Gõ search bị giật, mất ký tự.** Input search ở `packages/coloring/src/screens/jobs/jobs-screen.tsx` controlled trực tiếp bằng URL param `q`; mỗi phím gọi `router.replace()` → Next điều hướng + render lại cả màn. Input hiển thị giá trị URL cũ trong lúc chờ, phím gõ tiếp bị ghi đè.
2. **Search chỉ lọc 50 dòng của trang hiện tại.** Lọc chạy client-side trên `name + brand + id` của trang đang xem; server không nhận `q`. Tìm theo Nguồn (cột "Nguồn" = `CloneJob.data.brand`) vì thế "không được", tìm theo tên cũng hỏng như vậy.

## Thiết kế

### 1. Client: gõ mượt

- Input search có state local (`qInput`). Gõ chỉ đổi state.
- Debounce 300ms rồi `setParams({ q, page: null })`. URL vẫn shareable, vẫn giữ khi reload.
- Khi `q` trên URL đổi từ bên ngoài (Back, mở link) và khác `qInput`, đồng bộ lại input.
- `useCloneJobs` dùng `placeholderData: keepPreviousData` để bảng giữ kết quả cũ khi đang tải kết quả mới (không nháy skeleton).
- Bỏ lọc client-side cho server rows. Job nháp local (`useLocalJobs`) vẫn lọc client-side theo `q` vì không có trên server.

### 2. Server: search

- `GET /api/clone` nhận `q` (trim; rỗng = không lọc).
- Khớp không phân biệt hoa thường theo:
  - `name` và `id`: `contains` + `mode: "insensitive"` của Prisma.
  - Nguồn (`data->>'brand'`): Prisma JSON filter không có insensitive → `$queryRaw` lấy danh sách id có `data->>'brand' ILIKE '%q%'` (escape `%`, `_`, `\` trong q), gộp vào nhánh OR bằng `id: { in: ids }`.
- `buildCloneJobWhere` nhận thêm `q` và `brandMatchIds` (vẫn là hàm thuần, dễ test); route lo phần raw query.
- Giới hạn biết trước: nếu một từ khoá khớp nguồn của hơn ~30k job sẽ chạm giới hạn bind param của Postgres. Hiện có ~2.2k job; ghi comment cảnh báo.

### 3. Lọc theo nguồn

- `GET /api/clone/facets` trả thêm `sources: string[]` = DISTINCT `data->>'brand'` khác rỗng của `CloneJob`, sắp A→Z (raw query).
- `GET /api/clone` nhận `source`: khớp chính xác `data: { path: ["brand"], equals: source }`.
- UI: thêm `Select` "Mọi nguồn" cạnh niche/priority, cùng component. Không có option "Chưa có nguồn" (dữ liệu có thể thiếu khoá / null / "" — không đáng độ phức tạp).

### Tổng số trang

Điều kiện đếm `total` thật mở rộng từ `niche || priority` thành `niche || priority || q || source`.

## Test

- `filters.test.ts`: `q` (có / không có `brandMatchIds`), `source`, kết hợp với status/niche.
- `route.test.ts`: truyền `q`/`source` → cùng `where` cho findMany và count, có `total`; `q` gọi raw query lấy id theo nguồn.
- `facets/route.test.ts`: trả `sources`.

## Ngoài phạm vi

- Combobox có ô gõ cho dropdown nguồn (làm khi số nguồn lên hàng trăm).
- Cột `brand` thật / index cho search (cần migration).
