# Coloring Style — Vì sao bị trùng & hướng xử lý (decision brief)

**Ngày:** 2026-08-09
**Trạng thái:** Đang trao đổi với đối tác — *chưa* quyết hướng tận gốc.
**Mục đích:** Giải thích rõ tại sao thư viện Coloring Style sinh nhiều bản trùng, kèm ví dụ cụ thể và các hướng xử lý, để trình bày & chốt với đối tác lớn.

---

## 1. Hiện tượng

`/styles/colorstyles` xuất hiện nhiều Coloring Style **trùng/gần trùng**. Prod đã từng có **104 row / 87 tên phân biệt** (nhiều tên na ná nhau). Việc gộp (variants) đã giảm bớt, nhưng gốc vẫn còn.

## 2. Mô hình dữ liệu hiện tại (bối cảnh)

- **Một Coloring Style = 1 row `ColoringStyle`.**
- Row đó chứa mảng **`variants[]` (JSON)** — mỗi variant là một *bảng màu* (palette + directive) trích từ một bìa nguồn. UI gọi là **"Bảng màu (variants)"**.
- Variant **không phải** record riêng — chỉ là phần tử JSON bên trong row cha. (Đây là lý do trước đây không xóa lẻ variant được — xem §6.)

## 3. Nguyên nhân gốc: khóa dedupe là **tên do AI tự đặt**

Chuỗi nhân quả:

1. **Mỗi sách clone đều chạy trích xuất style.** Bước `stepGenerateCover` (và route admin `create-book`) gọi AI trích *coloring style* từ ảnh bìa nguồn của **từng** sách, để bìa giữ đúng "look" gốc.
2. **Tên style do LLM sinh tự do.** Prompt `COLORING_STYLE_EXTRACTION_PROMPT` yêu cầu AI trả `name` dạng gợi ý tự do (ví dụ *"Soft Watercolor Wash", "Bold Crayon Fill"*). Tên này **không xác định** — cùng một phong cách, mỗi lần chạy AI có thể đặt tên khác nhau.
3. **Dedupe chỉ khớp tên bằng nhau tuyệt đối** (case-insensitive, row cũ nhất thắng). Chống trùng theo *palette-fingerprint* chỉ hoạt động **sau khi** tên đã khớp.
4. **Fallback tên gắn với tựa sách:** khi AI không trả tên → tên fallback = `"<tựa sách> — style bìa gốc"`. Mỗi sách một tựa khác → **luôn tạo row mới**.

→ Cùng một phong cách hình ảnh, chỉ cần tên AI lệch đi một chút là dedupe trượt → đẻ row mới.

## 4. Ví dụ cụ thể

5 cuốn sách dùng **cùng một kiểu "crayon đậm"**:

| Sách | AI đặt tên | Kết quả |
|---|---|---|
| A "Jungle Friends" | `Bold Crayon Fill` | Tạo **row #1** (variant P1) |
| B "Ocean Pals" | `Bold Crayon Coloring` | Tên ≠ #1 → **row #2 (TRÙNG)** |
| C "Farm Day" | *(AI không trả tên)* → `Farm Day — style bìa gốc` | **row #3 (TRÙNG)** — fallback luôn unique |
| D "Dino World" | `Bold Crayon Fill` (khớp) | Gộp vào #1 thành variant P4 ✓ |
| E "Space Cats" | `Bold Crayon Fill`, palette trùng P1 | Dedupe palette → không ghi ✓ |

Kết quả: **3 row (#1/#2/#3) thực chất là một style**, nhưng thành 3 vì tên drift. Đây là cơ chế sinh ra "104 row / 87 tên".

## 5. Vì sao runtime dedupe không đủ

- Bắt near-duplicate theo *ngữ nghĩa tên* cần AI so khớp **tại request path** → tốn chi phí + chậm, nên đã bị loại (YAGNI).
- Do đó phải có **script cluster AI riêng** (`dedupe-coloring-styles.ts`) chạy định kỳ để dọn — tức là **dọn hậu quả**, không chặn nguồn.

## 6. Hệ quả: khó xóa/sửa variant

- Variant không có endpoint/UI để xóa-sửa lẻ (bị cắt YAGNI ban đầu: *"Variant editing UI — out of scope"*).
- `DELETE /api/coloring-styles/[id]` chỉ xóa **nguyên row cha** (kèm toàn bộ variants).
- Sách trỏ vào bằng `coverMeta.coloringStyleId` + `coloringVariantId` (không có FK) → xóa cha làm **ref sách mồ côi** âm thầm.

## 7. Các hướng xử lý tận gốc

Vấn đề gốc: hệ đang **trộn 2 khái niệm** — *"directive tô bìa của riêng sách này"* (ephemeral) và *"style tái dùng trong thư viện"* (curated). Auto-tạo một row thư viện cho **mỗi bìa sách** chính là máy đẻ trùng.

| Hướng | Ý tưởng | Ưu | Nhược |
|---|---|---|---|
| **A. Tách per-book khỏi thư viện** ⭐ | Bìa colorize thẳng từ `directive` vừa extract (lưu trong `book.coverMeta`), **không** tự tạo `ColoringStyle`. Thư viện chỉ thêm khi operator **chủ động promote**. | Chặn trùng ngay từ nguồn; thư viện sạch, curated; ăn khớp hướng "manual style + hashtag" | Cần nút "Lưu vào thư viện"; đổi luồng coverMeta |
| **B. Khóa dedupe xác định** | Bỏ tên-AI làm khóa; dùng chữ ký `medium + palette fingerprint` | Runtime bắt trùng tốt hơn | Có thể gộp nhầm 2 style khác nhau nhưng palette giống |
| **C. AI chọn tên từ danh mục cố định** | Prompt đưa enum tên để AI *phân loại* thay vì *bịa* | Tên xác định → dedupe theo tên chạy đúng | Cần bộ vocab; style lạ bị ép vào ô sẵn |
| **D. Giữ nguyên, chỉ dọn định kỳ** | Chạy script cluster như hiện tại | Không đổi code | Trùng vẫn đẻ; vẫn kẹt variant |

**Khuyến nghị:** Hướng **A** — trị đúng gốc (ngừng auto-tạo row từ mỗi bìa), biến thư viện thành nơi *curated + searchable*, và làm chuyện "xóa/sửa variant" gần như biến mất vì thư viện không còn phình vì rác. B/C chỉ siết khóa dedupe nhưng vẫn giữ cỗ máy auto-tạo.

**Đã xác nhận kỹ thuật:** `stepGenerateCover` *có thể* colorize chỉ bằng `directive` vừa extract + ảnh nguồn, **không bắt buộc persist** một `ColoringStyle` — việc lưu row hiện chỉ để đổ vào thư viện + ghi `coloringStyleId/variantId` lên sách. Nên Hướng A khả thi mà không phá luồng tô bìa.

## 8. Việc làm tạm thời (trong khi chờ chốt với đối tác)

Không đợi quyết định tận gốc, triển khai ngay 2 cải thiện quản lý:

1. **Cho phép xóa lẻ variant** khỏi style cha (kèm cảnh báo nếu variant đang được sách dùng).
2. **Chia `/styles/colorstyles` thành 2 nhóm** — *Manual add style* và *Clone add style* — để quản lý & tìm kiếm dễ hơn.

> Hai việc này *giảm đau* nhưng **không** thay thế quyết định tận gốc ở §7. Nếu chọn Hướng A, phần lớn nhu cầu "xóa/dọn variant" sẽ tự biến mất.
