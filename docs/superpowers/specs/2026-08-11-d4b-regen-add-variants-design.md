# D4b — Regen Thêm (variants[]) — Design

**Ngày:** 2026-08-11
**Sub-project:** D4b (second of three D4 slices; master spec `2026-08-09-ai-coloring-book-tools-design.md` §6.2/§6.3)
**Map task:** T-012, T-013, T-014
**Tiền đề:** D2, D3, D4a đã merge vào `main`. D4a thêm `sourcePageNumber`/`origin`/`parentPageNumber` cho book page.

D4 = 3 slice: **D4a** (ordering + Number/Background, DONE), **D4b** (Regen Thêm → `variants[]` — slice này), **D4c** (Push to Cover → `coverCandidates[]`).

---

## 1. Mục tiêu

Thêm khả năng **Regen Thêm** cho trang interior của Book: sinh thêm biến thể (variant) **non-destructive — luôn Add**, không ghi đè ảnh hiện có. Một trang có thể có nhiều biến thể cùng tồn tại; operator xem grid rồi chọn bản dùng. Khác với "Regen hàng loạt" (ghi đè) đã có — cái đó vẫn giữ.

- **T-012 Regen Thêm** → sinh N biến thể `origin:"regen"` vào `variants[]`, không đè.
- **T-013 Regen Thêm nguồn A/B** → operator chọn nguồn: A (New Source) / B (New Source + Original Prompt).
- **T-014 Regen Thêm không Replace** → `variants[]` + con trỏ `selectedVariantId`; bản gốc luôn giữ.

---

## 2. Quyết định đã chốt

| # | Quyết định | Chọn |
|---|---|---|
| Q1 | Nguồn A/B | **Làm cả A và B**; route gọi `editImage` trực tiếp. A = `buildRedesignPrompt(changePercent)`; B = prompt dựng từ `page.prompt` gốc. Giải quyết cảnh báo ⚠️ (không sửa `generatePage`). |
| Q2 | Con trỏ sau Regen Thêm | **Add-only**: biến thể mới không tự chọn; operator tự đổi. Lần regen đầu **seed** bản gốc thành variant `origin:"original"`. |
| Q3 | Nơi đặt UI | **2 nơi**: preview modal per-page (`page-actions-row`) + tab "Chọn hình" (`page-batch-select`) chọn nhiều trang để gen thêm. |
| Q4 | Batch cũ (ghi đè) | **Giữ cả hai**: "Regen hàng loạt (ghi đè)" cũ + "Regen Thêm hàng loạt (Add)" mới. |
| N1 | Route architecture | **Book-level tự chứa** (`/api/books/[bookId]/pages/[pageId]/variants`), không cần `cloneJobId` (ngầm chốt qua Q1). |
| N2 | Variant shape | Bỏ `parentVariantId`/`backgroundColor` của spec gốc (YAGNI — mọi regen re-anchor trên bản gốc). |
| N3 | count N/K | Operator nhập (mặc định 2); tái dùng ô `changePercent`. |

---

## 3. Data model (mở rộng JSON, tương thích ngược)

`BookColoringPage` (`packages/coloring/src/data/types.ts`) thêm 2 field optional:

```ts
variants?: {
  id: string;
  url: string;                      // line-art của biến thể
  coloredUrl?: string;              // bản tô của biến thể (nếu đã tô)
  origin: "original" | "regen";
  source?: "A" | "B";               // regen sinh từ nguồn nào (chỉ regen)
  prompt?: string;                  // prompt đã dùng (B = page.prompt gốc)
  changePercent?: number;
  createdAt: string;                // new Date().toISOString()
}[];
selectedVariantId?: string;         // con trỏ; page.url/coloredUrl mirror bản đang chọn
```

- **Backward-compat:** page cũ không có `variants`/`selectedVariantId` → hành xử như hiện tại (dùng `url`/`coloredUrl` trực tiếp). Không backfill.
- **Seed lười:** chỉ khi Regen Thêm lần đầu mới tạo `variants` = `[{origin:"original", url: page.url, coloredUrl: page.coloredUrl, ...}]` + các regen. Trước đó `variants` undefined.
- **Bất biến:** khi `variants` tồn tại, `selectedVariantId` luôn trỏ tới một variant; `page.url`/`page.coloredUrl` = url/coloredUrl của variant đó (mirror).

---

## 4. Variant helpers (pure, unit-tested)

File mới `packages/coloring/src/data/page-variants.ts` — hàm thuần trên object page, không I/O. Dùng bởi routes (server) và UI (mirror hiển thị).

```ts
export interface PageVariant {
  id: string; url: string; coloredUrl?: string;
  origin: "original" | "regen"; source?: "A" | "B";
  prompt?: string; changePercent?: number; createdAt: string;
}
export interface VariantPage {
  url: string; coloredUrl?: string;
  variants?: PageVariant[]; selectedVariantId?: string;
}

// Seed bản gốc thành variant nếu chưa có; trả { page, originalId }.
export function ensureOriginalVariant(page: VariantPage, newId: () => string, now: string): { page: VariantPage; originalId: string };

// Append (add-only, KHÔNG đổi selectedVariantId).
export function addVariants(page: VariantPage, incoming: PageVariant[]): VariantPage;

// Set selectedVariantId + mirror url/coloredUrl từ variant đó vào page.
export function selectVariant(page: VariantPage, variantId: string): VariantPage;

// Xoá 1 variant; chặn xoá bản đang chọn và bản origin:"original".
export function deleteVariant(page: VariantPage, variantId: string): VariantPage;
```

`newId`/`now` được inject để hàm thuần & test được (route truyền `crypto.randomUUID` + `new Date().toISOString()`).

---

## 5. API routes (book-level, gọi editImage trực tiếp)

Thư mục `apps/admin/src/app/api/books/[bookId]/pages/[pageId]/variants/`:

| Route | Method | Việc | Ràng buộc |
|---|---|---|---|
| `variants/route.ts` | POST | Regen Thêm: body `{ count: number, source: "A"\|"B", changePercent?: number }`. `ensureOriginalVariant` → gen `count` ảnh: `editImage(anchorUrl, prompt)` (A: `buildRedesignPrompt(changePercent)`; B: prompt dựng từ `page.prompt`) → upload R2 → `addVariants(origin:"regen")`. **Không** đổi con trỏ. | `count` clamp 1–4; `changePercent` clamp 5–95 |
| `variants/route.ts` | PATCH | Chọn: `{ variantId }` → `selectVariant` (mirror url/coloredUrl). | variantId phải tồn tại |
| `variants/[variantId]/route.ts` | DELETE | Xoá 1 variant. | Từ chối nếu là bản đang chọn hoặc `origin:"original"` |

- **Anchor** = variant `origin:"original"` url (line-art gốc của page). Tự chứa, không cần `cloneJobId`.
- **Prompt B:** dựng từ `page.prompt` (reproduction prompt lưu ở create-book). Nếu page không có `prompt` → B fallback về A (redesign template) + ghi chú.
- Ghi DB: cập nhật đúng phần tử `coloringPages` (khớp theo `pageId` = `coloringPage.id`, **không** theo index), tuân staging-write flag như các route khác.

### 5.1 Chạm colorize (1 dòng)
`POST /api/coloring-styles/colorize` hiện ghi `page.coloredUrl`. Thêm: nếu page có `selectedVariantId`, đồng bộ `coloredUrl` vào variant đang chọn (để đổi qua lại không mất màu). Đây là chỗ D4b chạm colorize — nhỏ, gọn.

---

## 6. Hook + UI

### 6.1 Hook
`packages/coloring/src/data/use-page-variants.ts`:
```ts
usePageVariants(bookId) → {
  enabled,
  regenAdd(pageId, { count, source, changePercent }),
  select(pageId, variantId),
  remove(pageId, variantId),
}
```
Guard `COLORING_WRITE_ENABLED`; invalidate `["coloring","book",bookId]`. Mirror pattern `use-fill-interior`/`use-pipeline-actions`.

### 6.2 Preview modal (`page-actions-row.tsx`)
- Nút **"Regen Thêm ×N"** → modal nhỏ: chọn nguồn **A/B**, `count`, `changePercent` → `regenAdd`.
- **Grid variants**: hiện tất cả `page.variants` với badge origin/source (`Gốc` / `Regen A` / `Regen B`) và viền nổi bật cho bản đang chọn (`selectedVariantId`). Không thêm token màu mới. Bấm 1 ô → `select` (mirror). Nút xoá trên ô (trừ bản chọn/gốc).
- Giữ nguyên Regen/Đổi góc/Apply/Colorize/Set-cover… cũ.

### 6.3 Tab "Chọn hình" (`page-batch-select.tsx`)
- **Giữ** "Regen hàng loạt (ghi đè)" cũ.
- **Thêm** "Regen Thêm hàng loạt (Add)": chọn nhiều trang → nhập `count`/`source`/`changePercent` → `runBatchRegen(indices, i => regenAdd(pages[i].id, …))` (sequential, tái dùng runner). Non-destructive.

---

## 7. Phạm vi & YAGNI

**Trong phạm vi:** 2 field trên page type; helper thuần + test; 3 route (POST/PATCH/DELETE variants); chạm colorize 1 dòng; hook; UI preview-modal + batch tab (giữ cả cũ).

**Ngoài phạm vi:**
- Không đụng cover / `coverCandidates[]` (D4c).
- Không `parentVariantId`/`backgroundColor`.
- Không sửa `generatePage`/`buildRedesignPrompt` (route gọi `editImage` trực tiếp).
- Không đụng flow reproduce/apply-candidate của clone job.
- Không bỏ "Regen hàng loạt (ghi đè)" cũ.

---

## 8. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Page không có `prompt` → B vô nghĩa | B fallback về A + ghi chú; đa số page có `prompt` (create-book copy) |
| Ghi nhầm phần tử coloringPages | Khớp theo `pageId` (id), không theo index |
| Regen tốn phí AI khi count lớn | count clamp 1–4; batch sequential; add-only nên không mất ảnh cũ |
| coloredUrl lệch giữa page và variant khi đổi | `selectVariant` mirror cả url+coloredUrl; colorize đồng bộ vào variant đang chọn |
| Mất bản gốc | `deleteVariant` chặn xoá `origin:"original"`; seed gốc trước khi thêm regen |
| Page cũ chưa từng regen | `variants` undefined → dùng url trực tiếp (backward-compat) |
