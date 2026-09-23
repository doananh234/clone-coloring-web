# Đếm số trang sách nguồn + tab "Sách thiếu trang"

## Vấn đề

Job trong tab Queue có `totalPages = 0` (import CSV đặt 0; số trang chỉ có sau bước `render`), nên không biết sách dày mỏng trước khi cho chạy. 2412/2412 job pending trên prod đang như vậy. Sách nguồn quá mỏng thì clone ra cũng không đủ trang ruột (pipeline nhắm 40 trang ruột).

## Thiết kế

### 1. Đếm trang — `@vx/server-core`
`countPdfPages(buffer)`: dùng lại bộ nạp pdfjs của `renderPdfToImages` (tách ra dùng chung), chỉ đọc `numPages`, không render.

### 2. Ngưỡng — `@vx/clone-core`
- `MIN_SOURCE_PAGES = 42` (40 ruột + bìa + 1 intro).
- Trạng thái mới `insufficient-pages`. KHÔNG tái dùng `awaiting-fill` (thuộc tính năng bổ sung trang ruột bị commit 4e1026f xoá, có thể khôi phục sau).
- `isInsufficientSourcePages(totalPages)` — hàm thuần, dùng chung cho pipeline và script.

### 3. Script `apps/worker/src/scripts/count-source-pages.ts`
Quét job `pending` có `totalPages = 0` → tải PDF (`sourcePdfUrl`) → đếm → ghi `totalPages`; dưới ngưỡng thì set `status = "insufficient-pages"`.
Dry-run mặc định, `--apply`, `--limit`. Chạy tay trong container (xem prod-maintenance-script-env-trap). ~1s/PDF (27–38 MB, cùng vùng AWS) → 2412 job ≈ 40–60 phút.

### 4. Chặn trong pipeline — `clone-job-processor.ts`
Ngay sau `stepRender` (cả luồng one-shot lẫn multi-step), đọc lại `totalPages`; dưới ngưỡng → `status = "insufficient-pages"` và return. Nằm TRƯỚC mọi lời gọi AI nên không tốn chi phí; bắt cả job tạo tay/upload PDF.

### 5. Giao diện
`STATUS_TABS`: thêm `{ key: "insufficient", label: "Sách thiếu trang", filter: "insufficient-pages" }`; thêm nhãn trạng thái trong `STATUS_META`. Tab chỉ để xem, không thêm nút. Số trang tự hiện ở cột "Nguồn" khi đã đếm.

## Test

- Unit: `isInsufficientSourcePages` (biên 41/42/43, 0 trang), chọn job của script, processor dừng khi dưới ngưỡng.
- `countPdfPages` phụ thuộc pdfjs → kiểm bằng PDF thật trên server sau deploy, báo số liệu cho user.

## Ngoài phạm vi

- Nút "Vẫn chạy" cho job thiếu trang (user chọn tab chỉ để xem).
- Tự động chạy định kỳ (user chọn chạy tay).
- Khôi phục tính năng `awaiting-fill` bị 4e1026f xoá.
