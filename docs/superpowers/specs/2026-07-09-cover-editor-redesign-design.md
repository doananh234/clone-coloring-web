# Cover Editor Redesign — Design

**Status:** Approved
**Date:** 2026-07-09
**Owner:** anh doan
**Reference UI:** `/Users/doananh/Downloads/image-color-and-cover-editor` (studied for pattern; NOT ported directly)
**Supersedes:** `apps/admin/src/components/text-overlay-modal.tsx`, `apps/admin/src/components/edit-cover-modal.tsx`

---

## Problem

Today, admins editing a book cover open a small modal that positions text over an image via CSS `position: absolute` and offers a single preset selector for font/color/outline/shadow. The two text lines (header + footer) share one style, positions are fixed to five values from a dropdown, aspect ratio can't change, and there's no direct-manipulation of layers. Compared with modern WYSIWYG editors (see reference UI at the path above — Fabric.js canvas, per-line typography, AI design suggestions), the current UX feels punitive for anything beyond trivial title placement.

## Goals

1. Ship a real WYSIWYG cover editor built on **Fabric.js 7** — direct drag/rotate/scale on the canvas, per-layer font/color/size.
2. **Three text slots**: `title`, `subtitle`, `brand`. `brand` auto-populates from `Brand.displayName`, editable.
3. **AI design pack suggestion** — one button, one Diaflow LLM call using the middle-page thumbnail + book context, returns title/subtitle/brand copy + font pairs + color palette + layout hint. User applies each part selectively.
4. **Editable persistence** — save the Fabric scene JSON alongside the flat PNG so re-opens restore exact state.
5. **1:1 export only** — write the resulting square PNG to all three Book URL fields (`coverUrl`, `thumbnailUrl`, `squareThumbnailUrl`) so every surface displays the same image.
6. **Backward compatible** — books already carrying `coverMeta` (from the worker's `stepGenerateCover`) open cleanly: existing `sourceThumbnailUrl` is the canvas background, existing `titleCover`/`subtitle` prefill the title + subtitle slots.

## Non-goals

- Custom user font uploads. Curated ~20-font Google Fonts subset only.
- Aspect ratio picker. Canvas is locked to 1:1.
- Multi-language spellcheck / AI-driven grammar edits.
- Per-page cover generation (this remains a Book-level cover only).
- Server-side live re-preview on every keystroke (client renders live; server only re-renders on final export).
- Retrofit existing books with a "scene" via migration script — first edit builds a new scene from scratch.
- Real coloring-style server round-trip in the editor. Style filters are CSS approximations for preview; real style still runs at worker or `/api/generate/colorize-preview` outside the editor.

---

## Design decisions (locked)

| # | Decision |
|---|---|
| 1 | Modal-based (large: `max-w-6xl`, ~90vw × 90vh) — keeps entry point (Book detail button) unchanged; standard shadcn `<Dialog>`. |
| 2 | Fabric.js 7 canvas engine, locked to 1:1 aspect ratio. |
| 3 | 3 fixed text slots: `title`, `subtitle`, `brand`. Each has independent font / color / size / position / transform. |
| 4 | `brand` slot text defaults to `Brand.displayName || Brand.name` of the selected brand for this Book; user override persists in `coverMeta.scene`. |
| 5 | Scene serialization: `Fabric.canvas.toJSON()` blob stored in `Book.data.coverMeta.scene`. Fabric-version-locked; migrate later if Fabric bumps. |
| 6 | On save: server export via new `/api/generate/cover-export` endpoint using `@napi-rs/canvas` + existing `fetchGoogleFont` (from `@vx/server-core/text-overlay/server`) to rebuild pixel-perfect PNG at 1024×1024. Live editor preview uses Google Fonts CSS `<link>` + `document.fonts.ready`. |
| 7 | AI suggestions: new `POST /api/generate/cover-design` endpoint calling `visionAnalyzeJSON` on `coverMeta.sourceThumbnailUrl` + book context. Response = design pack (title[] / subtitle[] / brand[] / fontPairs[] / palettes[] / layoutHint). Prompt lives at `packages/server-core/src/ai/prompts/cover-design-prompt.ts`. |
| 8 | Coloring-style filter preview is a **client-side CSS `filter:` approximation** on the background layer (vintage, warm, cool, monochrome, pastel, sepia, etc.). No server round-trip during editing. |
| 9 | Font catalog: hardcoded ~20 Google Fonts entries in `packages/server-core/src/text-overlay/text-overlay-presets.ts` (`FONT_CATALOG` — already exists). Both client and server load from the same list. |
| 10 | On save, the exported 1024×1024 PNG is written to `Book.coverUrl`, `Book.thumbnailUrl`, `Book.squareThumbnailUrl` (all three). `Book.data.coverMeta.scene` gets the fabric JSON. `Book.data.coverMeta.status = "manual"`. |
| 11 | Existing `TextOverlayModal` and `EditCoverModal` are **deleted** — one editor replaces both. |
| 12 | Legacy books without `coverMeta.scene`: open with `sourceThumbnailUrl` as background, `titleCover` → title slot, `subtitle` → subtitle slot, brand slot blank (or prefilled from Brand row). First save writes the new scene. |

---

## Architecture

### Component structure

```
apps/admin/src/components/cover-editor/
├── cover-editor-modal.tsx                # Dialog shell, open state, save orchestration (~150 lines)
├── canvas-editor.tsx                     # Fabric.js canvas + selection state (~250 lines)
├── control-panel/
│   ├── control-panel.tsx                 # Tab container (Text / Style / AI)
│   ├── text-panel.tsx                    # 3 slots × (text input + font + color + size + delete)
│   ├── style-panel.tsx                   # Background upload + coloring-style CSS-filter presets
│   └── ai-panel.tsx                      # Topic input + Suggest button + suggestion cards
├── hooks/
│   ├── use-cover-scene.ts                # Load initial scene, sync fabric events → React state
│   ├── use-google-fonts.ts               # Ensure fonts loaded in the browser before canvas draw
│   └── use-ai-suggestions.ts             # Wraps fetch to /api/generate/cover-design
└── types.ts                              # Slot names, StyleFilter enum, AI response shape
```

### Backend additions

- `packages/server-core/src/ai/prompts/cover-design-prompt.ts` — new prompt file with `buildCoverDesignPrompt(context: { title, category, brand, ageRange, tone }): { systemPrompt, userPrompt }`, response schema documented inline.
- `apps/admin/src/app/api/generate/cover-design/route.ts` — new. `POST` with `{ sourceThumbnailUrl, bookContext }` → calls `visionAnalyzeJSON` from `@vx/server-core/ai/llm-provider` → returns typed design pack.
- `apps/admin/src/app/api/generate/cover-export/route.ts` — new. `POST` with `{ sceneJson: FabricSceneJSON, backgroundImageUrl, filter?: StyleFilter }` → server-side rebuild via `@napi-rs/canvas` + `renderFabricSceneToPng` helper → returns `{ base64, url: string }` (uploaded to R2 at `assets/books/{bookId}/cover.png`).

### Backend reuse (unchanged)

- `@vx/server-core/text-overlay/server` (`renderTextOverlay`, `google-fonts-loader`) — reused inside cover-export renderer helper.
- `@vx/server-core/ai/llm-provider` (`visionAnalyzeJSON`, `cloneOneShot`) — Diaflow-backed.
- `@vx/server-core/ai/image-provider` (`colorizeImage`, `editImage`) — untouched.

### Deleted files (replaced by the new editor)

- `apps/admin/src/components/text-overlay-modal.tsx`
- `apps/admin/src/components/edit-cover-modal.tsx`

Any call site importing these gets rewritten to `<CoverEditorModal>`.

### Integration points

- `apps/admin/src/views/book-detail-page.tsx` — the two current buttons ("Add Text Overlay" + "Edit Cover") **collapse to one** button labeled "Edit Cover" that opens the new modal.
- `apps/admin/src/components/cover-thumbnail-step.tsx` (Book create wizard) — the cover step opens the same `<CoverEditorModal>` in place of the current inline picker.

---

## Data flow

### On modal open

```
1. Read Book.data.coverMeta from the current book row.
2. If coverMeta.scene exists → fabric.loadFromJSON(scene) → live editable canvas.
3. Else → build synthetic initial scene:
   - Background layer: fabric.Image from coverMeta.sourceThumbnailUrl (or Book.coverUrl fallback).
   - Title slot: fabric.Textbox with text = coverMeta.titleCover ?? Book.title, positioned top-center.
   - Subtitle slot: fabric.Textbox with text = coverMeta.subtitle ?? Book.subtitle ?? "", positioned bottom-center.
   - Brand slot: fabric.Textbox with text = Brand.displayName || Brand.name || "", positioned bottom-center-below-subtitle.
4. Ensure all fonts referenced by loaded scene are loaded via document.fonts.ready before first render.
```

### On user edit

- Text edits → fabric object.text mutated → canvas re-renders → text-panel state stays in sync via fabric selection events.
- Font/color/size changes → fabric object props mutated directly (no full re-load).
- Style filter change → CSS `filter:` on the background layer's Fabric filter (Grayscale, Sepia, Contrast, Warmth via HueRotate) — Fabric-native filter list; NOT a server call.
- Background swap (rare — user uploads new image) → fabric background layer image replaced. No R2 upload during editing.

### On AI Suggest

```
1. Ai panel reads current bookContext { title, subtitle, category, ageRange, brandName, tone: (optional user hint) }.
2. POST /api/generate/cover-design { sourceThumbnailUrl: coverMeta.sourceThumbnailUrl, bookContext }.
3. Server route:
   - Loads the thumbnail URL.
   - Calls visionAnalyzeJSON(sourceThumbnailUrl, buildCoverDesignPrompt(bookContext)).
   - Returns typed { titles: string[], subtitles: string[], brandLines: string[], fontPairs: {display: string, body: string}[], palettes: {name: string, background: string, primary: string, secondary: string}[], layoutHint: "centered" | "corner" | "banner-top" | "banner-bottom" }.
4. Panel renders each category as clickable cards:
   - Click a title card → title slot .text = clicked text.
   - Click a palette → background CSS filter approx OR text colors updated per palette mapping.
   - Click a font pair → title.fontFamily = display, subtitle.fontFamily = body, brand.fontFamily = body.
   - Layout hint applies preset positions to all three slots.
5. Each application is a discrete undo entry in fabric's history.
```

### On Save

```
1. Extract Fabric.canvas.toJSON() → sceneJson.
2. POST /api/generate/cover-export { sceneJson, backgroundImageUrl: sourceThumbnailUrl, filter: currentFilter }.
3. Server:
   - Rebuild scene with @napi-rs/canvas at 1024×1024.
   - Fetch background image, apply filter, draw.
   - For each fabric.Textbox in sceneJson: load font (via fetchGoogleFont), draw text with matching transform.
   - Encode PNG, upload to R2 at assets/books/{bookId}/cover.png, return url.
4. Client-side PUT Book:
   - coverUrl = <exported url>
   - thumbnailUrl = <exported url>
   - squareThumbnailUrl = <exported url>
   - data.coverMeta = { ...previous, scene: sceneJson, status: "manual", editedAt: <ISO> }
5. Close modal, invalidate book query, show toast.
```

---

## Data model additions

**No Prisma migration.** All fields extend the existing `Book.data.coverMeta` shape from the cover-generation feature.

```ts
// Extended coverMeta (existing fields kept, new fields optional):
interface CoverMeta {
  titleCover: string;
  subtitle: string;
  brandId: string;
  coloringStyleId: string;
  sourceThumbnailUrl: string;
  middlePageIndex: number;
  presetId: string;
  status: "generated" | "failed" | "manual";
  generatedAt: string;
  error?: string;
  // NEW — set by cover-editor Save:
  scene?: FabricSceneJSON;    // full Fabric.canvas.toJSON() output
  editedAt?: string;          // ISO timestamp of last manual edit
  filter?: StyleFilter;       // "none" | "vintage" | "warm" | "cool" | "monochrome" | "sepia" | "pastel"
}

type FabricSceneJSON = {
  version: string;
  objects: Array<Record<string, unknown>>;
  background?: string;
  [k: string]: unknown;
};

type StyleFilter =
  | "none"
  | "vintage"
  | "warm"
  | "cool"
  | "monochrome"
  | "sepia"
  | "pastel";
```

## AI design pack response schema

```ts
interface CoverDesignPack {
  titles: string[];                    // 3-5 candidate short titles (< 40 chars)
  subtitles: string[];                 // 3-5 candidate subtitles (< 60 chars)
  brandLines: string[];                // 2-3 optional byline suggestions
  fontPairs: Array<{
    id: string;
    display: string;                   // e.g. "Fredoka"
    body: string;                      // e.g. "Comfortaa"
  }>;                                  // 3-5 pairs, all from FONT_CATALOG
  palettes: Array<{
    id: string;
    name: string;                      // e.g. "Sunset warmth"
    background: string;                // hex
    primary: string;                   // title color
    secondary: string;                 // subtitle color
    accent: string;                    // brand color
  }>;                                  // 3-5 palettes
  layoutHint: "centered" | "corner" | "banner-top" | "banner-bottom";
}
```

The prompt (`buildCoverDesignPrompt`) is designed to force the LLM to return valid JSON exactly matching this schema. Prompt text is proprietary to this feature — new file at `packages/server-core/src/ai/prompts/cover-design-prompt.ts`.

---

## Style filter mapping (client-side CSS approximation)

Applied to the background layer via `fabric.Image.filters`. Fabric's native filter set covers what we need:

| StyleFilter | Fabric filters applied |
|---|---|
| `none` | none |
| `vintage` | Contrast (-0.1), Saturation (-0.2), Sepia (0.3) |
| `warm` | HueRotation (0), Saturation (+0.15), Brightness (+0.05) |
| `cool` | HueRotation (-15deg), Saturation (+0.1) |
| `monochrome` | Grayscale (1.0) |
| `sepia` | Sepia (1.0) |
| `pastel` | Saturation (-0.3), Brightness (+0.1), Contrast (-0.05) |

Server-side export uses the same numeric parameters via `@napi-rs/canvas` pixel math to guarantee identical output.

---

## Testing

**Unit (Vitest, co-located):**
- `packages/server-core/src/ai/prompts/cover-design-prompt.test.ts` — schema validation of the prompt's example output; verifies buildCoverDesignPrompt output for representative inputs.
- `apps/admin/src/app/api/generate/cover-design/route.test.ts` — mock `visionAnalyzeJSON` → route returns typed pack; validates 400 on missing input.
- `apps/admin/src/app/api/generate/cover-export/route.test.ts` — mock R2 upload + canvas → returns url; validates schema of accepted sceneJson.
- `apps/admin/src/components/cover-editor/hooks/use-cover-scene.test.ts` — initial scene construction from legacy `coverMeta` (title/subtitle preload, brand slot default).

**E2E (Playwright, single golden path — skipped in CI if browser deps missing):**
- Open Book detail → click "Edit Cover" → modal opens → edit title text → change font → Save → book row's `coverUrl` updates → modal closes.

**No screenshot tests** — Fabric canvas rendering is non-deterministic across environments.

---

## Failure handling

| Failure | Behavior |
|---|---|
| Fonts fail to load (Google CDN unreachable) | Fall back to `sans-serif`; log warning; export still works with system font. |
| AI cover-design endpoint fails | Panel shows error toast; suggestions section clears; user continues editing manually. No modal-level error. |
| cover-export fails (canvas / R2) | Save button surfaces error toast; sceneJson stays in local state so user can retry; Book row unchanged. |
| User loads a Fabric-version-incompatible scene (schema mismatch) | Editor logs warning, falls back to synthetic initial scene from legacy coverMeta; first save persists new schema-compatible scene. |
| Book has no `coverMeta.sourceThumbnailUrl` (very old book) | Fallback to `Book.coverUrl` for background; if that's also empty, canvas opens with white background + placeholder text. |

Nothing here blocks the user from saving. Silent AI failure = simply no suggestions; canvas edit path never hard-fails.

---

## Files touched

**Modified (4):**
1. `apps/admin/src/views/book-detail-page.tsx` — collapse 2 buttons into "Edit Cover" opening `<CoverEditorModal>`.
2. `apps/admin/src/components/cover-thumbnail-step.tsx` — open `<CoverEditorModal>` for the cover step.
3. `packages/server-core/src/text-overlay/text-overlay-presets.ts` — keep `FONT_CATALOG` as the shared curated list (may extend to ~20 entries if it's currently smaller).
4. Any other file that imported `TextOverlayModal` or `EditCoverModal` (grep at implementation time).

**New (14):**
- `apps/admin/src/components/cover-editor/cover-editor-modal.tsx`
- `apps/admin/src/components/cover-editor/canvas-editor.tsx`
- `apps/admin/src/components/cover-editor/control-panel/control-panel.tsx`
- `apps/admin/src/components/cover-editor/control-panel/text-panel.tsx`
- `apps/admin/src/components/cover-editor/control-panel/style-panel.tsx`
- `apps/admin/src/components/cover-editor/control-panel/ai-panel.tsx`
- `apps/admin/src/components/cover-editor/hooks/use-cover-scene.ts`
- `apps/admin/src/components/cover-editor/hooks/use-google-fonts.ts`
- `apps/admin/src/components/cover-editor/hooks/use-ai-suggestions.ts`
- `apps/admin/src/components/cover-editor/types.ts`
- `apps/admin/src/app/api/generate/cover-design/route.ts`
- `apps/admin/src/app/api/generate/cover-export/route.ts`
- `packages/server-core/src/ai/prompts/cover-design-prompt.ts`
- `packages/server-core/src/text-overlay/fabric-scene-renderer.ts` — server-only helper exported via `@vx/server-core/text-overlay/server`; used by cover-export route.

**Deleted (2):**
- `apps/admin/src/components/text-overlay-modal.tsx`
- `apps/admin/src/components/edit-cover-modal.tsx`

**New dependency:**
- `fabric@^7.4.0` added to `apps/admin/package.json` (matches reference UI, latest stable Fabric v7).

---

## Backward compatibility

- Existing `coverMeta` shape gains `scene?`, `editedAt?`, `filter?` — all optional. Any downstream consumer that reads `coverMeta.status`, `sourceThumbnailUrl`, etc. keeps working.
- Books whose coverMeta.status was `"generated"` or `"failed"` from the worker: first edit opens with the synthetic-initial-scene path, first save produces the new scene JSON. Status flips to `"manual"`.
- Old `text-overlay-blend` and `text-overlay` API routes stay in place — nothing else depends on them (verified before delete of the two modal components).
- Legacy books without `coverMeta` at all (from before the cover-generation feature): background falls back to `Book.coverUrl`, texts fall back to `Book.title` / `Book.subtitle`, brand slot filled from `Book.brandId` → `Brand.displayName`.

---

## Open questions

None — all decisions locked. Ready for spec review → implementation plan.
