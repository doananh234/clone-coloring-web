# Batch Regen cho trang sách — Design

**Ngày:** 2026-08-04
**Phạm vi:** Thêm chế độ chọn nhiều trang trong màn Chi tiết sách để regen hàng loạt (tuần tự, bỏ qua preview/confirm từng ảnh).

## Vấn đề

Khi review một cuốn sách, reviewer phát hiện nhiều trang bị lỗi gen ảnh. Hiện tại quy trình sửa là tuần tự thủ công cho **từng** trang: mở preview trang → bấm "Regen" → chờ ảnh candidate → bấm "Áp dụng" → đóng → mở trang kế tiếp. Rất tốn thời gian khi có nhiều trang lỗi.

## Mục tiêu

Cho phép chọn nhiều trang một lúc và regen tất cả trong một thao tác, chạy **tuần tự** (không parallel), **bỏ qua bước preview + xác nhận từng ảnh** — ghi đè thẳng ảnh mới vào trang.

## Quyết định đã chốt (với người dùng)

- **Loại regen:** chỉ **"Regen" giữ nguyên góc camera** (`newAngle: false`). Không làm "Đổi góc" hàng loạt.
- **Xử lý lỗi:** một trang lỗi thì **bỏ qua, chạy tiếp** các trang còn lại; báo cáo thành công/thất bại ở cuối.
- **Mức thay đổi (`changePercent`):** dùng **mặc định 30%** (giống nút regen đơn), không thêm UI chỉnh.
- **Xác nhận:** giữ **một** hộp confirm trước khi chạy cả batch (hiển thị số trang, cảnh báo ghi đè + tốn phí AI). Đây là confirm 1 lần cho cả batch, KHÁC với preview/confirm từng ảnh vốn bị loại bỏ.

## Đảm bảo tương đương với regen đơn

Batch phải sinh ảnh **giống hệt** nút "Regen" đơn lẻ:

- Cùng endpoint `POST /clone/{cloneJobId}/reproduce`, cùng vào `reproduceSinglePage` (`apps/admin/src/app/api/clone/[jobId]/reproduce/route.ts`).
- `newAngle: false` → `cameraView = undefined`, `changePercent = 30` → tham số `generateVariation` y hệt nút đơn.
- **Nguồn ảnh là ảnh redesign gốc**, không phải bản regen trước đó (`reproduce/route.ts:143`: `sourceImageUrl = redesignedUrl || imageUrl`), nên regen lặp không chồng biến dạng.
- Khác biệt duy nhất: `apply: true` khiến endpoint sau khi sinh ảnh **ghi thẳng vào trang sách** (`updateBookPageUrl`) thay vì trả candidate để chờ "Áp dụng". Thuật toán sinh ảnh không đổi.

## Kiến trúc

### 1. `BookDetailScreen` (`packages/coloring/src/screens/books/book-detail-screen.tsx`)

- Mở rộng state tab: `"info" | "pages"` → `"info" | "pages" | "select"`.
- Thêm mục tab thứ 3 nhãn **"Chọn hình"** cạnh "Tổng quan" và "Trang sách · N".
- Nhánh render tab `select` → `<PageBatchSelect bookId pages cloneJobId />`.
- `cloneJobId` lấy từ `book.data.cloneJobId` (đã có sẵn cách đọc trong `PageActionsRow`).

### 2. Component mới `PageBatchSelect` (`packages/coloring/src/screens/books/page-batch-select.tsx`)

Props: `{ bookId: string; pages: BookColoringPage[]; cloneJobId?: string }`.

State:
- `selected: Set<number>` — index các trang được chọn.
- `running: boolean`, `progress: { done: number; total: number; currentIndex: number | null }`.
- `results: Map<number, "ok" | "err">` + thông báo lỗi.

UI:
- **Empty/guard state:** nếu `!cloneJobId` → hiện "Sách không có clone job nguồn để regen". Nếu `!COLORING_WRITE_ENABLED` → nút disable + ghi chú (giống các thao tác ghi khác).
- **Thanh công cụ:** "Chọn tất cả" / "Bỏ chọn", đếm `Đã chọn X/N`, nút **"Regen hàng loạt"** (disable khi `selected.size === 0` hoặc `running`).
- **Lưới thumbnail** giống tab "Trang sách" nhưng mỗi ô có checkbox + viền highlight khi chọn; click ô = toggle. Ô đang xử lý có spinner; ô lỗi giữ viền đỏ.
- **Khu tiến trình** khi chạy: `Đang xử lý {done+1}/{total} · Trang {NN}…` và danh sách trạng thái từng trang (✓/✗).
- **Tổng kết** cuối: `Xong: {ok} thành công, {err} lỗi`.

### 3. `usePageActions` (`packages/coloring/src/data/use-page-actions.ts`)

Thêm một method:

```ts
/**
 * Regen (giữ góc) một trang và ghi thẳng vào trang sách trong một lần gọi
 * (apply:true) — bỏ qua bước preview/apply. Dùng cho batch regen.
 */
regenApply: async (pageIndex: number) => {
  if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
  if (!cloneJobId) throw new Error("Sách này không có clone job nguồn.");
  const res = await httpPost<{ succeeded?: number; failed?: number; results?: { error?: string }[] }>(
    `${COLORING_API_BASE}/clone/${encodeURIComponent(cloneJobId)}/reproduce`,
    { pageIndex, newAngle: false, apply: true },
  );
  if (!res?.succeeded) throw new Error(res?.results?.[0]?.error || "Regen thất bại.");
}
```

Không gọi `inval()` sau mỗi trang (tránh N lần refetch). Batch tự invalidate một lần khi xong.

### 4. Hàm chạy tuần tự (tách riêng để test)

Tách vòng lặp thành hàm thuần, không phụ thuộc React, để unit-test:

```ts
export async function runBatchRegen(
  indices: number[],
  regenOne: (index: number) => Promise<void>,
  onProgress: (done: number, index: number, ok: boolean) => void,
): Promise<{ ok: number[]; err: number[] }>
```

- Lặp `for ... of indices` với `await regenOne(i)` — tuần tự.
- try/catch mỗi trang: lỗi → đẩy vào `err`, **tiếp tục**; thành công → `ok`.
- Gọi `onProgress` sau mỗi trang.
- Trả `{ ok, err }` để component tổng kết.

`PageBatchSelect` gọi `runBatchRegen(sortedIndices, actions.regenApply, ...)`, sau đó `qc.invalidateQueries(["coloring","book",bookId])` một lần.

## Luồng dữ liệu

1. User mở tab "Chọn hình" → chọn các trang lỗi → bấm "Regen hàng loạt".
2. Hộp confirm 1 lần (`window.confirm`) hiển thị số trang + cảnh báo → OK.
3. `runBatchRegen` lặp tuần tự: mỗi trang gọi `regenApply(idx)` → `reproduce {pageIndex, newAngle:false, apply:true}` → ảnh mới ghi thẳng vào book page.
4. Cập nhật progress + trạng thái từng ô theo thời gian thực.
5. Xong: invalidate query sách → lưới load ảnh mới; hiện tổng kết; trang lỗi giữ highlight để thử lại.

## Trường hợp biên

- Sách không có `cloneJobId` → empty state, không có nút regen.
- Write flag tắt (`NEXT_PUBLIC_COLORING_WRITE=0`) → nút disable + ghi chú.
- Không chọn trang nào → nút disable.
- Đang chạy → khóa chọn/khóa nút để tránh chạy chồng.

## Test (Vitest, co-located)

`page-batch-select` hoặc file hàm runner: `run-batch-regen.test.ts`
- Chạy đúng thứ tự các index.
- Một trang throw → vẫn chạy hết, trả đúng `{ ok, err }`.
- `onProgress` được gọi đủ số lần, đúng cờ ok/err.

## Ngoài phạm vi (YAGNI)

- Không parallel.
- Không "Đổi góc" hàng loạt.
- Không UI chỉnh `changePercent`.
- Không hoàn tác (undo) — người dùng có thể regen lại từ ảnh gốc bất cứ lúc nào.
