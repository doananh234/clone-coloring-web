# D3 — Clone Jobs: đủ target Interior + Mark — Design

**Ngày:** 2026-08-11
**Sub-project:** D3 (theo master spec `2026-08-09-ai-coloring-book-tools-design.md` §5)
**Map task:** T-006, T-007, T-008, T-009
**Tiền đề:** D2 (phân loại Source 3 nhóm + classify gate) đã merge vào `main` (PR #3).

---

## 1. Mục tiêu

Sau khi operator xác nhận phân loại (gate D2), đảm bảo mỗi clone job có **đủ số trang interior mong muốn** (mặc định 40) bằng cách nhân bản ngẫu nhiên từ **chính các trang interior của source book đó** (giữ concept, an toàn bản quyền). Mỗi trang thêm được **đánh dấu trực quan** (số + nền màu) để phân biệt Original/Additional, và operator có thể **Regen (thay tại chỗ)** hoặc **Xóa** rồi **Fill lại** cho đủ.

Task mapping:
- **T-006 Target 40** → cấu hình được, default 40 (§3).
- **T-007 Random Source generate** → `stepFillInterior` nhân bản từ interior của chính job (§4).
- **T-008 Number Original/Additional** → Visual Management System, derive ở UI (§3, §6).
- **T-009 Background Additional** → nền cam, derive ở UI (§6).

---

## 2. Quyết định thiết kế đã chốt

| # | Quyết định | Chọn |
|---|---|---|
| Q1 | Nơi cấu hình target | **Global default (40) + per-job override** (`targetInteriorCount` trong `job.data`) |
| Q2 | Cách kích hoạt fill | **Auto khi resume gate** + **nút "Fill thêm cho đủ"** thủ công (API riêng) |
| Q3 | Lưu marking | **DB chỉ lưu `origin` + `parentPageNumber`**; `displayNumber` + `backgroundColor` derive ở UI |
| Q4 | Nơi đặt UI | **Gộp vào tab "So sánh & chọn trang"** (`JobCompareTab`), không tạo tab mới |
| N1 | pageNumber additional | **Tuần tự `max(pageNumber)+1`** (xếp cuối strip) |
| N2 | changePercent khi auto-fill | **Escalation theo vòng round-robin**: base 40, +10 mỗi lần tái dùng cùng source, cap 80. Regen-in-place: operator tự nhập % |
| N3 | Nút "Accept" | **Bỏ** (YAGNI) — additional mặc định được giữ & đã vào book; muốn bỏ thì Regen/Xóa |

---

## 3. Data model (thay đổi tối thiểu)

### 3.1 `CloneJobPage` — thêm 2 field bền vững
File: `packages/server-core/src/ai/clone-types.ts`, mirror ở `packages/coloring/src/data/types.ts`.

```ts
origin?: "original" | "additional";   // thiếu ⇒ coi như "original" (tương thích ngược với page cũ)
parentPageNumber?: number;            // chỉ có ở additional — pageNumber của interior gốc đã nhân bản
```

- **Không** thêm `displayNumber`, `backgroundColor` vào DB — derive ở UI (§6).
- Additional page tái dùng nguyên các field sẵn có: `pageNumber` (mới, tuần tự), `pageType:"interior"`, `redesignedUrl` (bản gen), `imageUrl` (kế thừa từ parent để so sánh), `status:"done"`.

### 3.2 `CloneJobDataExtras` — thêm target per-job
File: `packages/clone-core/src/job-context.ts`.

```ts
targetInteriorCount?: number;   // per-job override; thiếu ⇒ DEFAULT_TARGET_INTERIOR
```

### 3.3 Config default toàn cục
Hằng số trong clone-core (ví dụ cạnh `STEP_ORDER` hoặc trong `fill-interior.ts`):

```ts
export const DEFAULT_TARGET_INTERIOR = 40;

// Escalation % khi auto-fill nhân bản từ cùng một source qua các vòng round-robin.
export const FILL_CHANGE_BASE = 40;   // vòng 1 (mỗi source dùng lần đầu)
export const FILL_CHANGE_STEP = 10;   // +10 mỗi vòng tái dùng
export const FILL_CHANGE_CAP  = 80;   // trần
```

Target hiệu lực = `job.data.targetInteriorCount ?? DEFAULT_TARGET_INTERIOR`.
changePercent theo vòng `r` (0-based): `min(FILL_CHANGE_CAP, FILL_CHANGE_BASE + r * FILL_CHANGE_STEP)` → 40 / 50 / 60 / 70 / 80 / 80…

### 3.4 pageNumber cho additional
Gán tuần tự: `nextSeq = max(pages.map(p => p.pageNumber)) + 1`, tăng dần cho mỗi trang thêm. Không đụng số của trang gốc; additional xếp cuối strip theo `pageNumber`.

---

## 4. Worker — bước mới `stepFillInterior`

### 4.1 Vị trí trong pipeline
`STEP_ORDER` (`packages/clone-core/src/types.ts`) thêm `"fill-interior"` **giữa `reproduce` và `create-book`**:

```
download → render → analyze → extract-entities → reproduce → fill-interior → create-book → generate-cover
```

Luồng thực tế (one-shot):
```
render → stepOneShot(reproduce) → [GATE classify D2] → stepFillInterior → create-book → generate-cover
```

Trong `apps/worker/src/processor/clone-job-processor.ts`: chèn **ngay sau gate pass** (sau block `if (!gateData.classifyConfirmed) { … return; }`, hiện dòng 104), **trước** `stepCreateBook` (dòng 106):

```ts
if (!ctx.isDone("fill-interior"))
  await withRetry("fill-interior", () => stepFillInterior(ctx, db, fillInteriorDeps), ctx);
```

**Lý do đặt sau gate:** phải chờ operator chốt trang nào là interior/excluded rồi mới nhân bản — tránh fill từ trang bị phân loại sai.

### 4.2 Logic `stepFillInterior`
File mới: `packages/clone-core/src/steps/fill-interior.ts`.

```
target       = job.data.targetInteriorCount ?? DEFAULT_TARGET_INTERIOR
existing     = pages.filter(pageType==="interior" && !excluded).length   // đếm cả original LẪN additional đã có
need         = max(0, target - existing)
pool         = pages.filter(origin!=="additional" && pageType==="interior" && !excluded && imageUrl)  // nguồn random
nextSeq      = max(pages.pageNumber) + 1

if need === 0 || pool rỗng:
    markStepComplete("fill-interior"); return           // đã đủ/vượt, hoặc không có gì để nhân bản

made = 0
while made < need:
    round     = floor(made / pool.length)               // 0,1,2… — mỗi lần phủ hết pool = 1 vòng tái dùng
    // đầu mỗi vòng: xáo lại pool (random không trùng trong vòng)
    src       = pool[đã-xáo][made % pool.length]
    changePct = min(FILL_CHANGE_CAP, FILL_CHANGE_BASE + round * FILL_CHANGE_STEP)   // 40/50/60/70/80…
    { base64 } = generatePage({ sourceImageUrl: src.imageUrl, pageNumber: nextSeq, jobId, changePercent: changePct })
    redesignedUrl = uploadR2(base64)
    push CloneJobPage {
      pageNumber: nextSeq++, pageType:"interior", origin:"additional",
      parentPageNumber: src.pageNumber, imageUrl: src.imageUrl,
      redesignedUrl, status:"done"
    }
    made++
markStepComplete("fill-interior")
```

- **Chọn source:** random không trùng cho tới khi hết `pool`, hết thì xáo lại vòng mới (round-robin). Khi `pool >= need` (đủ hình gốc) thì **không tái dùng** — mỗi bản một source, tất cả ở %=40. Khi `need > pool` thì mới tái dùng, và **% tăng theo vòng** để các bản từ cùng một source khác biệt rõ.
- **Ví dụ:** 30 gốc/cần 10 → 10 source khác nhau, đều 40%. · 10 gốc/cần 30 → 3 vòng: 10 bản 40% + 10 bản 50% + 10 bản 60%. · 12 gốc/cần 28 → 12@40% + 12@50% + 4@60%.
- **Idempotency:** `isDone("fill-interior")` đảm bảo resume sau confirm chỉ fill **một lần**. Nút "Fill lại" thủ công đi qua API riêng (§5), không phụ thuộc step flag → có thể bù nhiều lần.

### 4.3 `fillInteriorDeps`
File: `apps/worker/src/processor/step-deps.ts`. Tái dùng `generatePage` + uploader R2 (giống `reproduceDeps`). `generatePage` bỏ qua tham số `prompt`, dùng `changePercent` — khớp hiện trạng, **không cần sửa** `generatePage`/`buildRedesignPrompt`. `changePercent` giờ là biến (escalation §4.2), không hardcode.

---

## 5. API routes mới

Thư mục `apps/admin/src/app/api/clone/[jobId]/`:

| Route | Method | Việc | Ràng buộc |
|---|---|---|---|
| `fill-interior` | POST | Nút "Fill thêm cho đủ" — chạy lại logic fill bù cho đủ target, trả pages cập nhật | Không dựa `isDone`; luôn tính lại count |
| `pages/[pageNumber]/regen` | POST | Regen additional **thay tại chỗ**: `generatePage(parent.imageUrl, { changePercent })` → ghi đè `redesignedUrl` chính trang đó. Nhận `changePercent` từ body (operator nhập, clamp 5–95) | Chỉ `origin==="additional"` |
| `pages/[pageNumber]` | DELETE | Xóa 1 trang additional → count tụt | **Chỉ** `origin==="additional"` (từ chối xóa original) |

- Logic fill của route `fill-interior` **dùng chung** phần lõi với `stepFillInterior` (tách hàm thuần trong `fill-interior.ts` để cả worker lẫn route gọi được, tránh trùng lặp).
- Các route ghi DB tuân theo cơ chế "staging write enabled" hiện có (giống `usePipelineActions`).

---

## 6. UI — gộp vào `JobCompareTab`

File: `packages/coloring/src/screens/jobs/job-compare-tab.tsx` (+ hook data mới nếu cần, ví dụ `use-fill-interior.ts`).

### 6.1 Derive marking (không lưu DB)
- `origin` thiếu ⇒ coi là `"original"`.
- **displayNumber:** original ⇒ `#{pageNumber}`; additional ⇒ `#{parentPageNumber}·A{n}` với `n` = thứ tự trong nhóm additional cùng `parentPageNumber` (sort theo `pageNumber`).
- **backgroundColor:** additional ⇒ nền **cam** (token màu "additional" theo master spec §3.3); original ⇒ như cũ.

### 6.2 Header tiến độ (đầu tab)
- Thanh `Interior: {count}/{target}` (đếm interior !excluded).
- Nút **"Fill thêm cho đủ"** → `POST fill-interior`. Hiện khi job đã qua reproduce. Disabled khi chưa bật ghi thật (staging).

### 6.3 Page strip (trái)
- Trang additional: **nền cam** + nhãn `#12·A2` (derive). Click chọn như trang thường.
- Sort theo `pageNumber` ⇒ additional nằm cuối strip.

### 6.4 Panel phải khi chọn trang additional
- Thay cụm 4-slot reproduce bằng cặp so sánh:
  - **Parent (Hình gốc #12)** — `parent.imageUrl` (tra theo `parentPageNumber`).
  - **Additional (bản gen)** — `redesignedUrl`.
  - Dùng component `Candidate` sẵn có.
- Actions: **Regen (thay tại chỗ)** → `POST pages/[n]/regen` với `changePercent` từ ô `% thay đổi` sẵn có ở tab (operator tự nhập, mặc định 30); **Xóa** → `DELETE pages/[n]`.
- **Không** có nút Accept (N3).
- Trang **original** giữ nguyên panel 4-slot cũ (không đổi).

---

## 7. create-book — gần như không đổi

`stepCreateBook` (`packages/clone-core/src/steps/create-book.ts:101-111`) đã partition theo `pageType`. Additional có `pageType:"interior"` ⇒ tự rơi vào `interiorPages → coloringPages[]`.

- **Bổ sung:** đảm bảo `interiorPages` được **sort theo `pageNumber`** trước khi map (original trước, additional sau) — kiểm tra hiện trạng, thêm nếu thiếu.
- `parentPageNumber`/`origin` không ảnh hưởng output book. Admin route parity (`create-book/route.ts`) áp cùng sort nếu cần.

---

## 8. Kế thừa cho D4

Các field D3 thêm (`origin`, `parentPageNumber`) **được D4 kế thừa nguyên**, không phân loại lại (master spec §3.4, §5.3). Book hiển thị Number + Background theo cùng quy ước để nhìn ra cấu trúc & lịch sử.

---

## 9. Phạm vi & YAGNI

**Trong phạm vi:** 2 field DB, `stepFillInterior` + step order, 3 API route, mở rộng `JobCompareTab`, sort interior ở create-book.

**Ngoài phạm vi (không làm ở D3):**
- Không tách bảng DB riêng cho page/variant (đó là hướng D4 `variants[]`).
- Không sửa `generatePage`/`buildRedesignPrompt` (prompt vẫn bị bỏ qua — chấp nhận được vì fill dùng changePercent).
- Không thêm cờ `reviewed`/Accept.
- Không thêm ô cấu hình escalation trong UI ở D3 (dùng hằng số 40/+10/cap 80; regen-in-place vẫn cho operator nhập % qua ô sẵn có).

---

## 10. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| `pool` rỗng (không interior gốc nào) | `stepFillInterior` skip an toàn, markComplete, không chặn pipeline |
| Fill tốn phí AI khi target lớn | `need = target − existing` nên chỉ gen đúng số thiếu; count tính cả additional đã có nên không fill dư |
| Bản additional từ cùng source na ná nhau | Escalation % theo vòng round-robin (40/50/60/70/80) khi buộc tái dùng source |
| Xóa nhầm trang original | API DELETE **chỉ** cho `origin==="additional"` |
| Trùng lặp logic fill (worker vs route) | Tách hàm lõi thuần trong `fill-interior.ts`, cả hai cùng gọi |
| Thứ tự interior lộn xộn trong book | Sort theo `pageNumber` ở create-book |
