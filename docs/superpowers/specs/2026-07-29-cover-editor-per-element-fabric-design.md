# Cover Editor Redesign — Per-Element Sessions + Fabric.js + Global Font Library

**Date:** 2026-07-29
**Status:** Approved (design)
**Supersedes editor internals of:** `2026-07-09-cover-editor-redesign-design.md`

## Problem

The current cover editor (`/coloring/books/:id/cover`, "Sửa chữ trên hình" tab) is not
production-grade for editing title / subtitle / brand:

- Built on a **custom DOM-drag preview + `compose-cover.ts` canvas render**, not a real
  object model. It is described in-app as "fabric" but is not Fabric.js.
- **Only Title** has full controls (font, size, color, drag + resize). **Subtitle** shares
  Title's font and has **hardcoded** color/size (`SUB_COLOR`, 13px). **Badge** (page count)
  is fully fixed (amber pill) — not editable.
- **One shared font** for title+subtitle — not a per-element session.
- **No visible/hidden toggle** — an element only appears if its text is non-empty.
- Fonts are a **hardcoded array** (`FONTS`) loaded via a Google Fonts `@import` in
  `motio.css`. **No font management, no font upload.**
- Layout is ephemeral — only the flattened PNG is saved; reopening cannot re-edit positions.

## Goals

1. Each cover text element (**Title, Subtitle, Brand, Badge** — fixed set of 4) is its own
   editable session: text, font, weight, size, color, alignment, letter-spacing, drag-drop
   position, and visible/hidden toggle.
2. Rebuild the editor on **Fabric.js (v6)** — a real object model with selection handles.
3. **Global font library** stored in R2 + DB: a font picker listing built-in + uploaded
   fonts, font upload, and a dedicated management page.
4. Editable layout **persists** (re-openable), not just the baked PNG.

## Non-Goals

- Per-element stroke/shadow/rotation/opacity (kept out for a focused UI — only font, weight,
  size, color, align, letter-spacing).
- Arbitrary free-form text elements (fixed set of 4).
- Changes to the "Gen bằng AI" tab (left as-is).
- Multi-weight/variant font families on upload (one file = one family; bold synthesized).

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Font storage | Global library on R2 + Prisma DB, reusable across all books |
| Editor foundation | Fabric.js v6 (real objects, handles) |
| Elements | Title, Subtitle, Brand, Badge — fixed 4, each with own session + visibility |
| Style props per element | fontFamily, fontWeight, fontSize, color, textAlign, letterSpacing |
| Rollout | Phase 1 = editor; Phase 2 = font library |

## Architecture

### 1. Data model — per-element session

```ts
type CoverElementKey = "title" | "subtitle" | "brand" | "badge";

interface CoverElement {
  text: string;
  fontFamily: string;
  fontWeight: 400 | 500 | 600 | 700;
  fontSize: number;        // px in logical canvas space (side = 1024)
  color: string;           // hex
  textAlign: "left" | "center" | "right";
  letterSpacing: number;   // px
  left: number;            // fabric coords in logical canvas space
  top: number;
  visible: boolean;
}

interface CoverDoc {
  version: 1;
  elements: Record<CoverElementKey, CoverElement>;
}
```

- Persisted to `book.data.coverLayout` (Json) so the layout is re-editable on reopen.
- Books without `coverLayout` initialize from `book.title` / `book.subtitle` / page count +
  any extracted `coverStylePack` (fonts/colors), matching current default positions.
- All geometry is stored in a **fixed logical canvas** (square, side 1024). Preview scales
  the canvas to the container; export scales up to full image resolution via a multiplier.

### 2. Fabric editor component — `cover-fabric-editor.tsx` (new; replaces `cover-canvas.tsx`)

Responsibilities:
- **Lazy-load** `fabric` via dynamic `import("fabric")` inside `useEffect` (client-only —
  avoids Next SSR issues and keeps fabric out of the shared bundle, per web perf rules).
- Create a `Canvas` at logical side 1024, displayed responsively (CSS scaling of the
  container). Keep the volt safe-zone guide as a non-interactive overlay.
- Set background image with `FabricImage.fromURL(proxiedUrl, { crossOrigin: "anonymous" })`
  using the existing `/coloring-img` proxy (`toProxied`) so `toDataURL` is not tainted.
- Create four `Textbox` objects, each tagged with `obj.set({ data: { key } })`. Apply
  per-element props from `CoverDoc`. `visible: false` → object not added / hidden.
- On `selection:created` / `selection:updated` / `selection:cleared` → emit `selectedKey`
  to the parent so the right-hand panel shows that element's controls.
- On `object:modified` (move / scale / rotate) → write geometry + size back into `CoverDoc`
  and call `onChange`.
- Before adding/re-rendering text, `await document.fonts.load(...)` for each element's font
  (including uploaded faces) so the canvas renders the correct face.
- `export(): Promise<{ base64: string; blob: Blob }>` → `canvas.toDataURL({ format: "png",
  multiplier: fullSide / 1024 })`. On CORS taint, throw the existing clear error message.

`compose-cover.ts` is removed — Fabric renders both preview and export (single source of
truth). `wrap()` word-wrapping is no longer needed (Textbox handles wrapping).

### 3. Editor screen — `cover-editor-screen.tsx` (refactor)

Layout:
- **Left:** the fabric editor canvas.
- **Right — "Elements" panel:**
  - A list of the 4 elements; each row has a 👁 **visible/hidden toggle** and is selectable
    (selecting a row also selects the object on canvas, and vice-versa).
  - Below: **style controls for the currently selected element** — text input, **font picker**
    (`font-picker.tsx`), weight, size (slider), color (swatches + native picker), text align
    (left/center/right), letter-spacing.
  - Keep **"Trích lại style từ bìa"** — applies extracted fonts/colors to the elements.

Actions:
- **Lưu cover** → `editor.export()` → `saveCover.save(base64)` (writes `coverUrl`) **and**
  persist `CoverDoc` to `book.data.coverLayout`.
- **Xuất PNG** → `editor.export()` → download.
- **"Gen bằng AI" tab** — unchanged.

### 4. Global font library (R2 + DB)

**Prisma model** (`packages/db/prisma/schema.prisma`, following the `Brand` pattern):

```prisma
model Font {
  id        String   @id @default(cuid())
  name      String   // font-family name used in CSS/fabric
  fileUrl   String   // R2 public URL
  format    String   // "woff2" | "ttf" | "otf"
  weight    Int?     // optional nominal weight
  isPublic  Boolean  @default(true)
  data      Json     @default("{}")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**API routes** (local `/api`, same style as `brands`, using `@vx/db` + `@vx/server-core/r2`):
- `GET /api/fonts` — list.
- `POST /api/fonts` — body `{ name, base64, format }` → upload to R2 under `fonts/…` with
  content-type by extension → create row. Validate format ∈ {woff2, ttf, otf} and size cap.
- `DELETE /api/fonts/[id]` — delete row (+ best-effort R2 object delete).
- `PATCH /api/fonts/[id]` — rename.

**Client** `use-fonts.ts`: `list()`, `upload(file, name)`, `remove(id)`, `rename(id, name)`.
On list load, inject each uploaded font as a face via the **FontFace API**
(`new FontFace(name, url).load()` → `document.fonts.add`) so it is usable in both fabric and
CSS. De-duplicate against already-registered families.

**Font picker** `font-picker.tsx`: a dropdown grouping **built-in** `FONTS` and **uploaded**
fonts, each option rendered in its own face for preview, plus a **"＋ Upload font"** button
that opens a small dialog (name + `.woff2/.ttf/.otf` file). Used by the element style panel.

**Management page** `/coloring/fonts` (sidebar entry): list + preview + upload + rename +
delete (full CRUD). Reuses `use-fonts.ts` and the picker's upload dialog.

### 5. Risks & mitigations

- **Fabric v6 + Next SSR** — instantiate only client-side inside `useEffect`; guard `window`;
  dynamic import so fabric never runs on the server.
- **Export CORS taint** — background loaded through the `/coloring-img` same-origin proxy with
  `crossOrigin: "anonymous"`; on taint, surface the existing clear Vietnamese error.
- **Font upload safety** — validate mime/extension and enforce a size limit; reject others.
  Bold weight synthesized when the uploaded file lacks a bold variant.
- **Bundle size** — fabric (~300kb) lazy-loaded only on the cover editor route.
- **Back-compat** — old books have no `coverLayout`; initialize defaults from title/subtitle +
  page count + extracted pack. The old shared `layout`/`font` state is dropped.

## Rollout / build order

- **Phase 1 — Editor:** data model + `cover-fabric-editor.tsx` + `cover-editor-screen.tsx`
  refactor + `CoverDoc` persistence to `book.data.coverLayout`. Font picker uses built-in
  `FONTS` only. Remove `compose-cover.ts` and `cover-canvas.tsx`.
- **Phase 2 — Font library:** `Font` model + migration + `/api/fonts` routes +
  `use-fonts.ts` + FontFace injection + `font-picker.tsx` wired to uploaded fonts +
  `/coloring/fonts` management page + sidebar entry.

## Success criteria

- Each of Title/Subtitle/Brand/Badge can be independently edited (text, font, weight, size,
  color, align, letter-spacing), dragged/positioned on canvas, and toggled visible/hidden.
- Reopening a saved cover restores the editable layout (not just the PNG).
- Users can upload a font (.woff2/.ttf/.otf), see it in the picker, apply it to any element,
  and reuse it across other books; manage (rename/delete) fonts from a dedicated page.
- Export/save produces a full-resolution PNG matching the on-screen preview.

## Open questions

- Dedicated `/coloring/fonts` management page vs upload-in-picker only — design includes both;
  can drop the standalone page if not wanted.
- Exact R2 font size cap and allowed formats beyond woff2/ttf/otf.
