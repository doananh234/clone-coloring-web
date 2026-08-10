# D4a — Book View: Ordering + Number/Background — Design

**Ngày:** 2026-08-11
**Sub-project:** D4a (first of three D4 slices; see master spec `2026-08-09-ai-coloring-book-tools-design.md` §6.5)
**Map task:** T-010, T-011
**Tiền đề:** D2 (classify) + D3 (fill-interior, `origin`/`parentPageNumber` on JobPages) đã merge vào `main`.

D4 được tách 3 sub-project độc lập: **D4a** (ordering + Number/Background — sub-project này), **D4b** (Regen Thêm → `variants[]`, T-012/013/014), **D4c** (Push to Cover → `coverCandidates[]`, T-015/016/017). Làm theo thứ tự a→b→c; D4a là tầng hiển thị nền, D4b/D4c dùng lại.

---

## 1. Mục tiêu

Màn chi tiết Book hiển thị đúng thứ tự **Cover → Interior Intro → Interior** (không trộn), và mỗi hình có **Number + Background** (theo Visual Management System §3.2/§3.3) để nhìn ra cấu trúc & lịch sử ngay, không cần mở từng item. Kế thừa phân loại từ D2/D3 — **không phân loại lại**.

- **T-010 Sắp xếp Book** → hiển thị 3 nhóm Cover/Intro/Interior riêng biệt.
- **T-011 Number + Background** → mỗi book page mang số trang gốc + màu nền theo type/origin.

---

## 2. Quyết định đã chốt

| # | Quyết định | Chọn |
|---|---|---|
| Q1 | "Number" trên book page | **Số trang gốc kế thừa** từ JobPage (`sourcePageNumber`), UI derive `#N` / `#parent·An` |
| Q2 | Book cũ (thiếu metadata) | **Degrade gọn, không backfill**: fallback số theo vị trí + màu mặc định; chỉ book mới có badge đầy đủ |
| Q3 | Phạm vi UI | **Chỉ `book-detail-screen`** (colorize/cover-editor để D4b/c) |
| N1 | Lưu marking | Theo tiền lệ D3: DB lưu lineage tối thiểu (`sourcePageNumber`, `origin`, `parentPageNumber`); `displayNumber` + màu **derive ở UI** |
| N2 | Data ordering | **Không** đổi — Book đã lưu cover/intro/interior thành 3 mảng riêng; interior đã sort theo pageNumber (D3). D4a chỉ nhóm hiển thị |

---

## 3. Data model (mở rộng, tương thích ngược)

### 3.1 `BookColoringPage` + summary page item — thêm 3 field optional
File: `packages/coloring/src/data/types.ts` (`BookColoringPage`, và shape của `summaryPages[]`), mirror ở shape mà `create-book` ghi (`packages/clone-core/src/steps/create-book.ts`).

```ts
sourcePageNumber?: number;               // số trang gốc từ JobPage (nhãn #N); thiếu ⇒ fallback theo index
origin?: "original" | "additional";       // interior lineage (additional = D3 fill); thiếu ⇒ "original"
parentPageNumber?: number;                // additional → pageNumber của interior gốc (nhãn #parent·An)
```

- Tất cả **optional** → book cũ (thiếu) vẫn parse, degrade theo Q2.
- Cover không cần field — luôn là `book.coverUrl` (indigo theo bản chất).

### 3.2 Backward compat
Book tạo trước D4a: `coloringPages`/`summaryPages` không có 3 field này → UI dùng fallback (§4). Không viết backfill (Q2).

---

## 4. Derive helper (pure, unit-tested)

File: `packages/coloring/src/data/book-page-meta.ts` (mới) — hàm thuần, không I/O.

```ts
export interface BookPageMetaInput {
  sourcePageNumber?: number;
  origin?: "original" | "additional";
  parentPageNumber?: number;
}
export interface BookPageLabel { displayNumber: string; isAdditional: boolean }

// `page`   — the page being labeled
// `index`  — its position in the interior array (fallback numbering when metadata is absent)
// `interior` — the full interior array, so additional siblings sharing a parent can be
//              ranked for the A<n> suffix (mirrors D3's deriveAdditionalMeta(page, allPages)).
export function deriveBookPageLabel(
  page: BookPageMetaInput & { id?: string },
  index: number,
  interior: (BookPageMetaInput & { id?: string })[],
): BookPageLabel
```

Logic:
- `origin === "additional"` & `parentPageNumber != null` → `#{parentPageNumber}·A{n}` where `n` = 1-based rank of this page among interior pages that are `origin:"additional"` with the same `parentPageNumber` (ordered by their array position / id), `isAdditional: true`.
- else có `sourcePageNumber` → `#{sourcePageNumber}`, `isAdditional: false`.
- else **fallback** (thiếu cả hai) → `#{index+1}`, `isAdditional: false`.

**Màu nền (tone) theo §3.3** — do UI quyết định theo (nhóm section + origin):
- Cover → indigo; Intro → amber; Interior original → mặc định; Interior additional → cam.
- (regen/teal, excluded/dim: thuộc D4b — không có ở D4a.)

Token màu chính xác (CSS vars) chốt ở plan sau khi đọc `apps/admin/src/app.css`; cam tái dùng token additional của D3 (`--warning`).

---

## 5. create-book — kế thừa metadata (2 path parity)

`buildPage` hiện tạo `{ id, url, isPublic, prompt, sceneData }`. Thêm stamp 3 field từ JobPage nguồn:

- **Worker step** `packages/clone-core/src/steps/create-book.ts` — `buildPage(p, destKey)` nhận thêm quyền đọc `p.pageNumber`/`p.origin`/`p.parentPageNumber`; interior stamp cả 3, intro stamp `sourcePageNumber`.
- **Admin route parity** `apps/admin/src/app/api/clone/[jobId]/create-book/route.ts` — cùng thay đổi.

Kết quả: book mới có metadata đầy đủ; badge/nhãn/màu chính xác. `excluded` vẫn bị drop trước đó (D2), không xuất hiện.

---

## 6. UI — `book-detail-screen.tsx` (chỉ màn này)

Tab **"Trang sách"** (hiện `tab === "pages"`, render lưới phẳng `coloringPages`, đánh số theo index — dòng ~429) đổi thành **3 mục có nhãn, không trộn**, theo thứ tự:

1. **Cover** — 1 ô từ `book.coverUrl` (viền/nhãn indigo).
2. **Interior Intro** — `summaryPages`, mỗi ô badge `#N` (từ `sourcePageNumber`), viền amber.
3. **Interior** — `coloringPages`, badge `displayNumber` (`#N` / `#p·An`), nền **cam** nếu additional, mặc định nếu original.

`PageThumb` sửa: nhận `label: BookPageLabel` + `tone` → hiển thị `displayNumber` (thay `index+1`) và viền/nền theo tone. Giữ badge "MÀU" (coloredUrl) như cũ.

Không đụng: colorize-screen, cover-editor, book-edit, "Chọn hình / Regen hàng loạt" tab (D4b/c hoặc ngoài phạm vi).

---

## 7. Phạm vi & YAGNI

**Trong phạm vi:** 3 field optional trên book page types; stamp ở 2 create-book path; derive helper thuần + test; UI 3-mục + PageThumb tone ở book-detail.

**Ngoài phạm vi:**
- Không backfill book cũ (degrade gọn).
- Không đổi data ordering (Book đã tách 3 mảng; interior đã sort).
- Không `variants[]` / Regen Thêm (D4b), không `coverCandidates[]` / Push to Cover (D4c).
- Không đụng colorize/cover-editor/book-edit.
- Không màu regen(teal)/excluded(dim) — chưa có type đó ở book D4a.

---

## 8. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Book cũ thiếu metadata | Fallback `#{index+1}` + màu mặc định; field optional nên không vỡ parse |
| Drift giữa 2 create-book path | Stamp cùng bộ field ở cả worker step + admin route (parity, như D2/D3) |
| Đánh số A`<n>` sai khi nhiều additional cùng parent | Helper thuần + unit test đúng ca (mirror `deriveAdditionalMeta` của D3) |
| Token màu amber/indigo chưa có trong theme | Plan đọc `app.css` chốt token; cam tái dùng `--warning` (đã dùng ở D3) |
