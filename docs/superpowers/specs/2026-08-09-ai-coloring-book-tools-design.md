# AI Coloring Book Tools — Master Design

| Field | Value |
|-------|-------|
| ID | PLAN-AICB-TOOLS-001 (design) |
| Nguồn | `# AI Coloring Book - Tools PLAN.md` (đối tác lớn) |
| Ngày | 2026-08-09 |
| Trạng thái | Approved for planning |
| Loại | Master spec — decompose thành 1 tầng nền + 4 sub-project |

---

## 1. Mục tiêu & phạm vi

Chuẩn hóa bộ tool xuyên suốt pipeline:

**Source Book → Clone Jobs → Generate → Select → Coloring → Book**

Đây **không phải một feature** mà là **4 sub-project độc lập** (D1–D4 trong plan) cộng **một tầng nền chung**. Mỗi sub-project sẽ có implementation plan riêng (spec → plan → build). Tài liệu này là master spec định hình toàn bộ và các quyết định thiết kế đã chốt.

### Thứ tự triển khai (theo luồng dữ liệu)

```
Tầng nền chung → D2 (Source) → D3 (Clone Jobs) → D4 (Book) → D1 (Style)
```

Lý do: data sạch từ gốc (D2) giảm rác cho các bước sau — đúng như mục Risks của plan cảnh báo. D1 độc lập nhất, để cuối.

---

## 2. Hiện trạng codebase (điểm neo)

| Khái niệm plan | Thực tế trong code | Khoảng cách |
|---|---|---|
| Source Book | `SourceBook` (Prisma) = metadata CSV: `fileName/topicName/thumbnailUrl/bookUrl/niche`. **Không có dữ liệu cấp trang**. | Trang chỉ xuất hiện khi chạy CloneJob |
| Clone Jobs | `CloneJob.pages[]` (JSON). Pipeline: `download → render → analyze → extract-entities → reproduce → create-book` (one-shot gộp 4 bước giữa). `generatePage({prompt, sourceImageUrl, …})` | Chưa auto-fill, chưa mark |
| Book | `Book.coverUrl` (1 string), `summaryPages[]` (JSON, **luôn rỗng hiện tại**), `coloringPages[]` (JSON) | Chưa non-destructive, chưa candidate |
| Coloring Style | `ColoringStyle` đã có `tags String[]`, `thumbnailUrl`, `referenceImages`, `variants`, `colorizationDirective` | Thiếu manual create + search theo hashtag |

**Phát hiện then chốt:** `create-book.ts` hiện **không phân loại thật**:
```
coverUrl   = coloringPages[0]   // chỉ là "trang 1"
summaryPages: []                // LUÔN rỗng
coloringPages = TẤT CẢ trang    // mọi thứ đổ vào Interior
```
LLM analyze đã emit `isCover`/`titleCover` (theo `book-page-meta.ts`) nhưng **không ai dùng**. Phần lớn công việc D2 là *kết nối* tín hiệu sẵn có, không phải xây từ đầu.

Tô màu hiện dùng `colorizationDirective` + `referenceImageUrls` (xem `colorize-test-modal.tsx`: `test({ imageUrl, colorizationDirective, referenceImageUrls })`).

---

## 3. Tầng nền chung — Visual Management System + Non-destructive

"Sợi chỉ đỏ" nối D2/D3/D4 (System Insight của plan). Định nghĩa **một lần, dùng khắp nơi**.

### 3.1 `origin` (mỗi image/variant)
`original` · `additional` (D3) · `regen` (D4). Cover riêng: `source` · `pushed`.

### 3.2 Number convention
`#N` (số gốc) + nhãn origin:
- `#12 – Original`
- `#12 – Additional` (nhiều → `Additional 1/2/…`)
- `#18 – Regen 2`

### 3.3 Background color convention (bảng màu dùng chung toàn tool)

| Ý nghĩa | Màu |
|---|---|
| `interior / original` | mặc định (không tô) |
| `interiorIntro` (D2) | amber |
| `cover` (D2) | indigo |
| `additional` (D3) | cam |
| `regen` (D4) | teal |
| `excluded` (D2) | **không phải màu type** — thể hiện bằng mờ + gạch ngang |

### 3.4 Nguyên tắc Non-destructive
Generate / Regen Thêm / Coloring / Push **luôn Add, không Replace**; luôn có **con trỏ "đang chọn"** + giữ lịch sử.
**Ngoại lệ duy nhất:** Regen ở D3 khi additional *chưa* được duyệt vào Book (thay tại chỗ, chấp nhận được vì chưa có gì để mất).

---

## 4. Sub-project A — D2: Source Book Classification

**Map task:** T-003, T-004, T-005.

### 4.1 Quyết định
- **Taxonomy `pageType` đúng 3 loại** (khớp 100% plan): `cover` · `interiorIntro` · `interior`.
- **Inclusion là chiều riêng**, không phải loại thứ 4: cờ `excluded: boolean` để loại back cover (T-004) / trang trắng / rác. Dùng lại tinh thần `SourceBook.removed` sẵn có. (Đã bỏ ý tưởng `skip` ban đầu vì nó trộn 2 chiều type + inclusion, và để taxonomy khớp đúng cái đối tác mô tả.)
- **Cơ chế: Hybrid** — auto-classify tại bước `analyze` + **gate review bắt buộc** trước khi tạo Book.

### 4.2 Data model
Mỗi `JobPage` (trong `CloneJob.pages[]`) thêm:
```ts
pageType?: "cover" | "interiorIntro" | "interior";  // default heuristic
excluded?: boolean;                                  // true = loại khỏi Book
```
Không phá cấu trúc cũ (thêm field optional).

### 4.3 Auto-classify (trong `stepOneShot`)
**Contract Diaflow (chốt 2026-08-10):** flow one-shot trả về **per-page** 3 boolean trong `llm_0_output`: `isCover`, `isIntro`, `isInterior`. `classifyPage` tiêu thụ theo **thứ tự ưu tiên `isCover` > `isIntro` > `isInterior`** → `cover`/`interiorIntro`/`interior`.
- Fallback khi không có tín hiệu nào (flow cũ / trang không chắc): page 1 = `cover` (trừ khi đã có cover khác), còn lại = `interior`. Pre-scan `llmFlaggedCover` tránh page-1 thành cover giả khi cover thật ở trang khác.
- `excluded` **luôn = false ở auto** — Diaflow KHÔNG gửi tín hiệu loại bỏ; back cover / trắng / rác do operator tick tại gate. (Nếu sau này Diaflow thêm `isBackCover`/`isBlank`, mở rộng `classifyPage` để set `excluded` gợi ý.)

### 4.4 Gate review bắt buộc (bước mới trong pipeline)

> **Quyết định vị trí gate (2026-08-10):** Chế độ mặc định là **one-shot** (`stepOneShot` gộp analyze+reproduce trong 1 lần gọi Diaflow → khi có analyze data thì trang **đã redesign**). Vì vậy gate đặt **SAU `stepOneShot`, TRƯỚC `create-book`** — không tách one-shot. Đánh đổi: chấp nhận đã tốn generate cho cả trang sẽ bị `excluded`; gate thấy ảnh đã redesign (không phải ảnh gốc). Luồng: `render → stepOneShot(analyze+reproduce) → [GATE classify] → create-book`.

Pipeline **dừng sau `stepOneShot`** (ghi status `gate-pending`), chờ operator xác nhận rồi resume để chạy `create-book`. Khả thi vì pipeline là BullMQ worker async (không phải sync HTTP).
- UI đặt trong **CloneJob detail** (không tạo màn hình mới — trang chỉ tồn tại sau analyze). Tận dụng `job-pipeline-tab` / `page-batch-select`.
- Lưới trang, mỗi trang: badge `pageType` + màu nền (mục 3.3), dropdown đổi loại `Cover · Intro · Interior`, toggle `Exclude`.
- Nhóm theo loại: Cover → Intro → Interior; excluded gom cuối (mờ + gạch ngang).
- Bulk: chọn nhiều → gán 1 loại / exclude hàng loạt.
- Ràng buộc mềm (cảnh báo, không chặn): 0 hoặc >1 trang `cover`.

### 4.5 `create-book` dùng phân loại
- `cover` → `coverUrl` (thay vì lấy đại page 1).
- `interiorIntro` → `summaryPages[]` (thay vì luôn rỗng).
- `interior` → `coloringPages[]`.
- `excluded` → bỏ.
- **Kế thừa nguyên:** các bước sau (D3/D4) không phân loại lại.

---

## 5. Sub-project B — D3: Clone Jobs — đủ 40 Interior + Mark

**Map task:** T-006, T-007, T-008, T-009.

### 5.1 Quyết định
- **Target cấu hình được, default 40** (app config / per-job; không hardcode).
- **Nguồn random = chỉ interior của chính source book này** (giữ concept, an toàn bản quyền).

### 5.2 Bước mới `stepFillInterior`
Chèn **sau gate classify (D2)** và **trước `create-book`** (khớp vị trí gate one-shot đã chốt ở 4.4):
```
render → stepOneShot(analyze+reproduce) → [GATE classify D2] → stepFillInterior → create-book
```
> Lưu ý one-shot: các trang gốc đã reproduce trong `stepOneShot`. `stepFillInterior` tự gọi `generatePage` cho các trang additional mới (không phụ thuộc bước reproduce riêng).
Logic:
```
while count(interior, !excluded) < target:
    src = random interior chưa dùng (round-robin nếu đã hết)
    gen = generatePage(src)              // redesignedUrl mới
    push JobPage mới {
      pageType: "interior",
      origin: "additional",
      parentPageNumber: src.pageNumber,   // lineage để compare cũ/mới
      displayNumber, backgroundColor,     // Visual Management System
    }
```

### 5.3 Marking & lineage
Mỗi JobPage bổ sung thêm: `origin`, `parentPageNumber`, `displayNumber`, `backgroundColor`.
- Đánh số: `#12 – Original` (gốc) / `#12 – Additional [n]` (kế thừa số cha).
- Additional: màu nền cam (mục 3.3) → nhận diện tức thì.

### 5.4 Compare & Accept/Regen
Tận dụng `job-compare-tab.tsx` + `image-comparison.tsx`:
- Hiển thị cặp Additional cạnh Original-cha (`parentPageNumber`).
- Actions/additional: **Accept** (giữ) / **Regen** (thay tại chỗ — non-destructive *chưa* áp dụng vì additional chưa vào Book).
- Xóa additional → count tụt → nút "Fill lại" gọi lại `stepFillInterior`.

---

## 6. Sub-project C — D4: Book Non-destructive

**Map task:** T-010, T-011, T-012, T-013, T-014, T-015, T-016, T-017.

### 6.1 Quyết định
- **Lưu candidate/version bằng cách mở rộng JSON blob** (`variants[]` trong page) — ít rủi ro, khớp pattern, không migration nặng. (Không tách bảng DB `BookImage` ở giai đoạn này — ghi nhận là opportunity tương lai.)
- **Regen Thêm hỗ trợ cả 2 nguồn**, operator chọn: A (New Source) / B (New Source + Original Prompt).
- **Push to Cover: thêm candidate + auto chọn làm cover chính** (bản cũ vẫn lưu).

### 6.2 Data model (mở rộng JSON, tương thích ngược)

Interior page:
```ts
coloringPage {
  id, url, coloredUrl, coloringStyleId, prompt, ...   // giữ nguyên
  variants?: [
    { id, url, coloredUrl, prompt,
      origin: "original" | "regen",
      parentVariantId?, backgroundColor?, createdAt }
  ],
  selectedVariantId?   // con trỏ; url/coloredUrl mirror bản đang chọn
}
```

Cover:
```ts
book.data.coverCandidates?: [
  { id, url, origin: "source" | "pushed", fromPageId?, createdAt }
]
book.coverUrl   // vẫn là con trỏ tới candidate đang chọn (list/thumbnail dùng)
```

### 6.3 Regen Thêm (T-012/013/014)
- Khác "Regen hàng loạt" (batch, thay thế) đã có — Regen Thêm **luôn Add**.
- `Regen Thêm ×N` của #18 → thêm N variant `origin:"regen"` vào `variants[]`; #18 + #18-Regen1..N cùng tồn tại để chọn.
- Nguồn: modal cho chọn **A** (New Source) hoặc **B** (New Source + Original Prompt) — mục tiêu tạo khác biệt đủ lớn, không đẻ hình gần giống.
- ⚠️ **Cảnh báo impl (2026-08-10):** `generatePage` hiện **bỏ qua tham số `prompt`** (`step-deps.ts`: "kept for signature compat; ignored") — nó tự build prompt qua `buildRedesignPrompt`. Nên option **B (Original Prompt)** sẽ là **no-op** nếu không sửa `generatePage`/`buildRedesignPrompt` để nhận prompt truyền vào. Cần xác minh & quyết ở plan D4.

### 6.4 Push to Cover (T-015/016/017)
Sau khi tô 1 interior → nút **Push to Cover**:
- Thêm candidate mới vào `coverCandidates[]` (`origin:"pushed"`, `fromPageId`).
- **Auto chọn làm cover chính** (đổi con trỏ `coverUrl`) — cover cũ + candidate khác vẫn lưu.
- **Không** đổi/xóa interior gốc; coloring output giữ riêng.
- Từ candidate có thể mở **Cover editor** (đã có, `CoverTextOverlay`) để thêm chữ → tạo candidate mới, không đè.

### 6.5 Sắp xếp Book (T-010/011)
- Hiển thị đúng thứ tự **Cover → Interior Intro → Interior**, không trộn.
- Kế thừa `pageType` từ D2 (không phân loại lại).
- Mỗi hình có Number + Background (mục 3.2/3.3) → nhìn Book hiểu ngay cấu trúc & lịch sử không cần mở từng item.

---

## 7. Sub-project D — D1: Coloring Style — Manual + Hashtag

**Map task:** T-001, T-002.

> **Cập nhật review 2026-08-10 — D1 nhỏ hơn spec gốc:** `POST /api/coloring-styles` (route.ts:56) **đã** stamp `data: { source: "manual" }` (PR #2). Tag search trên list **đã có** (`entity-list-screen.tsx:70`, khớp cả name/description/tags). Flow extract vốn `analyze → create` nên `colorizationDirective` đã auto-derive. → **Việc còn lại của D1:** (a) thêm **ô nhập hashtag/tags** vào `extract-style-screen.tsx` (hiện thiếu); (b) **normalize + autocomplete** hashtag. Không cần build form mới, không cần đụng source/search cơ bản.

### 7.1 Quyết định
- **Manual Style:** form tạo `ColoringStyle` tối giản (ảnh + tên + nhiều hashtag), `data.source = "manual"`.
- **Search theo hashtag** với normalize + autocomplete.
- **Auto-derive directive bằng AI:** khi tạo manual style, chạy AI phân tích ảnh sinh `colorizationDirective`/palette tự động (chất lượng tô tốt nhất; tái dùng lối AI-extracted đã có).

### 7.2 Manual Style (T-001)
- Upload ảnh → `referenceImages` + `thumbnailUrl`; nhập tên + hashtags → `tags[]`.
- AI derive `colorizationDirective` + `colorPalette` từ ảnh (tái dùng pipeline extract sẵn có).
- Đánh dấu `data.source = "manual"` để phân biệt với style AI-extracted.

### 7.3 Search theo Hashtag (T-002)
- Filter danh sách style theo `tags[]`: `Search Hashtag → Filter → List Styles`.
- Dùng khi chọn style lúc tô (`coloring-style-picker-modal` đã có).
- **Chuẩn hóa hashtag** (Risk plan: tránh tag trùng nghĩa/sai chính tả):
  - Normalize khi lưu: lowercase, trim, bỏ `#`, space → kebab (`Bold Easy` → `bold-easy`), dedupe.
  - Autocomplete: gợi ý từ tag đã tồn tại khi gõ.

---

## 8. Task mapping (T-001 … T-017)

| Task | Sub-project | Ghi chú |
|---|---|---|
| T-001 Manual Style Name+Hashtag | D1 | + auto-derive directive |
| T-002 Search Style theo Hashtag | D1 | normalize + autocomplete |
| T-003 Phân loại Source 3 nhóm | D2 | pageType 3 loại |
| T-004 Bỏ Back Cover | D2 | qua cờ `excluded` |
| T-005 Fix Source theo type | D2 | create-book chia đúng nhóm |
| T-006 Target 40 | D3 | cấu hình được, default 40 |
| T-007 Random Source generate | D3 | chỉ source book này |
| T-008 Number Original/Additional | D3 | Visual Mgmt System |
| T-009 Background Additional | D3 | cam |
| T-010 Sắp xếp Book | D4 | Cover→Intro→Interior |
| T-011 Number+Background trong Book | D4 | kế thừa D2/D3 |
| T-012 Regen Thêm | D4 | Add, không Replace |
| T-013 Regen Thêm nguồn A/B | D4 | operator chọn |
| T-014 Regen Thêm không Replace | D4 | variants[] |
| T-015 Push Coloring→Cover | D4 | candidate mới |
| T-016 Push theo Add | D4 | auto chọn, giữ cũ |
| T-017 Interior không bị thay khi Push | D4 | coloring output riêng |

---

## 9. Rủi ro & điểm cần lưu khi làm plan chi tiết

- **Gate bắt buộc (D2)** thêm 1 bước thủ công cho *mọi* job — cần UX gọn để không thành nút thắt cổ chai.
- **Tương thích ngược:** `coverUrl` / `coloredUrl` phải luôn mirror bản đang chọn để list/thumbnail/PDF cũ không vỡ.
- **Legacy books:** đã có book với `summaryPages: []` và `coverUrl = page1`; cần quyết định có backfill phân loại hay chỉ áp dụng cho job mới (khuyến nghị: chỉ job mới, không backfill).
- **JSON blob phình to:** variants[] + coverCandidates[] làm `Book`/`CloneJob` row lớn dần — theo dõi; đây là lý do ghi nhận `BookImage` như hướng migrate tương lai.
- **Auto-classify chất lượng:** heuristic fallback cần đủ tốt để operator không phải sửa quá nhiều tại gate.
- **`generatePage` bỏ qua `prompt`:** ảnh hưởng D4 option B (xem 6.3) — cần sửa hàm generate nếu muốn dùng original prompt.
- **`extract-entities` là step chết** (marked complete, không chạy) ở multi-step; D2 không dựa vào nó.
- **Gate one-shot tốn generate cho trang excluded:** đánh đổi đã chấp nhận (mục 4.4) để tránh refactor one-shot; theo dõi nếu tỉ lệ trang bị loại cao.

---

## 10. Điểm dừng của tài liệu này

Master spec đã chốt 8 quyết định thiết kế + tầng nền chung. Bước tiếp theo: mỗi sub-project (theo thứ tự D2 → D3 → D4 → D1) sẽ có **implementation plan riêng**. Bắt đầu với D2.
