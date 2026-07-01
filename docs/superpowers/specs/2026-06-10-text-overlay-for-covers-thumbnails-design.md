# Text Overlay for Covers & Thumbnails — Design Spec

## Problem

LLMs (GPT-image-2, Gemini) cannot reliably render text with correct font families, letter spacing, or spelling. Current `compose-cover` endpoint embeds text via prompt ("Add the title in bold, decorative lettering") which produces inconsistent, hallucinated typography.

## Solution

A reusable text overlay tool that:
1. Renders text server-side with `@napi-rs/canvas` using real fonts from Google Fonts CDN
2. Composites text onto any image (cover, thumbnail, or any preview)
3. Optionally sends the composited result through LLM `editImage()` for organic blending

## Reference

Pattern: bold playful font at top (title), smaller text at bottom (subtitle/tagline), outline stroke for readability over colorful illustrations. See coloring book covers on Etsy for examples.

---

## Architecture

```
Client (Browser)                          Server (API)
─────────────────                         ────────────
Image preview displayed
  ↓ user clicks [Add Text]
TextOverlayModal opens
  - Live CSS preview (instant)
  - Google Fonts loaded via <link>
  - Text/font/color/preset changes
    update preview in real-time
  ↓ user clicks [Apply]
POST /api/generate/text-overlay  ───→  1. Fetch .ttf from Google Fonts
                                       2. Cache in /tmp/fonts/
                                       3. Register with GlobalFonts
                                       4. Load source image onto canvas
                                       5. Draw header text (outline+fill+shadow)
                                       6. Draw footer text (if provided)
                                       7. Export PNG base64
                                 ←───  Return composited image

  ↓ (optional) user clicks [AI Blend]
POST /api/generate/text-overlay-blend → editImage() with blend prompt
                                 ←───  Return blended image
```

## API Design

### `POST /api/generate/text-overlay`

**Request:**
```typescript
{
  imageUrl: string;              // source image URL or data URL
  header: TextBlockConfig | null;
  footer: TextBlockConfig | null;
}
```

**Response:**
```typescript
{
  success: true;
  previewUrl: string;   // data:image/png;base64,...
  base64: string;
}
```

### `POST /api/generate/text-overlay-blend`

**Request:**
```typescript
{
  imageBase64: string;   // canvas-composited image
  prompt?: string;       // default: "Blend the text naturally into the illustration style"
}
```

**Response:** Same as text-overlay.

---

## Data Model

### TextBlockConfig

```typescript
type TextBlockConfig = {
  text: string;
  fontFamily: string;       // Google Font family name
  color: string;            // hex, e.g. "#FFFFFF"
  outlineColor: string;     // hex, e.g. "#333333"
  outlineWidth: number;     // 0-5px
  shadow: boolean;
  position: string;         // header: "top"|"center", footer: "bottom-left"|"bottom-center"|"bottom-right"
  scale: number;            // 0.5-1.5 relative to auto-calculated size
};
```

### TextPreset

```typescript
type TextPreset = {
  id: string;
  name: string;
  fontFamily: string;
  color: string;
  outlineColor: string;
  outlineWidth: number;
  shadow: boolean;
};
```

### TextOverlayConfig

```typescript
type TextOverlayConfig = {
  header: TextBlockConfig | null;
  footer: TextBlockConfig | null;
};
```

---

## Presets

| Preset | Font Family | Text Color | Outline | Outline Width | Shadow | Vibe |
|--------|------------|------------|---------|---------------|--------|------|
| Playful | Fredoka One | `#FFFFFF` | `#333333` | 3px | yes | Kids books |
| Elegant | Playfair Display | `#1a1a1a` | none | 0px | subtle | Adult/women's |
| Bold | Bebas Neue | `#FFFFFF` | `#000000` | 4px | yes | High contrast |
| Handdrawn | Caveat | `#4a3728` | `#FFFFFF` | 2px | no | Artsy/whimsical |
| Clean | Poppins 700 | `#FFFFFF` | `#555555` | 2px | subtle | Professional |

### Extended Font Catalog (~20 fonts for "More fonts..." picker)

- Playful: Fredoka One, Bubblegum Sans, Baloo 2, Luckiest Guy, Boogaloo
- Elegant: Playfair Display, Dancing Script, Great Vibes, Cormorant Garamond
- Bold: Bebas Neue, Oswald, Anton, Black Ops One, Righteous
- Handdrawn: Caveat, Patrick Hand, Indie Flower, Shadows Into Light
- Clean: Poppins, Montserrat, Raleway, Nunito

---

## Client: TextOverlayModal

### UI Layout

```
┌──────────────────────────────────────────────┐
│  Text Overlay Editor                    [✕]  │
│                                              │
│  ┌────────────────────────────────┐          │
│  │     "COZY & CUTE"    ← CSS    │          │
│  │                       overlay  │          │
│  │      [source image]           │          │
│  │                               │          │
│  │     "Coloring Book"  ← footer │          │
│  └────────────────────────────────┘          │
│                                              │
│  Title: [Cozy & Cute_______________]         │
│  Footer: [Coloring Book____________]         │
│  Font:  [Fredoka One ▼]                     │
│  Preset: (●Playful)(Elegant)(Bold)(Hand)(Clean)│
│                                              │
│  ▸ Advanced                                  │
│    Text color: [■ #FFF]  Outline: [■ #333]   │
│    Outline width: [━━●━━] 3px                │
│    Shadow: [✓]                               │
│    Header pos: (●Top)(Center)                │
│    Footer pos: (Left)(●Center)(Right)        │
│    Font size: [━━━●━] 100%                   │
│                                              │
│  [Cancel]         [Apply]  [AI Blend ✨]     │
└──────────────────────────────────────────────┘
```

### Preview Behavior

- Image rendered as `<img>` inside a relative container
- Header/footer text as absolutely-positioned `<div>`s with inline styles
- Google Font loaded dynamically: inject `<link href="fonts.googleapis.com/css2?family=...">` into `<head>`
- All changes (text, font, color, outline, shadow, position) update preview instantly — no server call
- CSS `text-shadow` for outline simulation in preview
- Final pixel-perfect render done server-side via `@napi-rs/canvas`

### Font Picker

- Dropdown with preset fonts shown in their own font (Google Fonts CSS loaded per option)
- "More fonts..." option opens scrollable list of ~20 curated fonts
- Each font option rendered in that font for visual selection

---

## Server: Text Rendering Pipeline

### Google Fonts Loader (`google-fonts-loader.ts`)

```
fetchGoogleFont(family: string, weight?: number): Promise<string>
  1. Check /tmp/fonts/{family}-{weight}.ttf exists → return cached path
  2. GET https://fonts.googleapis.com/css2?family={family}:wght@{weight}
     (User-Agent header set to get .ttf format)
  3. Parse CSS response → extract url(...) for .ttf
  4. Download .ttf to /tmp/fonts/{family}-{weight}.ttf
  5. Return local path
```

### Text Renderer (`text-renderer.ts`)

```
renderTextOverlay(imageBuffer: Buffer, config: TextOverlayConfig): Promise<Buffer>
  1. Create canvas matching source image dimensions
  2. Draw source image onto canvas
  3. For each text block (header, footer):
     a. Register font: GlobalFonts.registerFromPath(ttfPath, familyName)
     b. Calculate fontSize = canvas.width * 0.08 * config.scale (header)
        or canvas.width * 0.05 * config.scale (footer)
     c. Set ctx.font = `${fontSize}px "${familyName}"`
     d. Calculate text position based on config.position
     e. If shadow: set ctx.shadowColor, shadowBlur, shadowOffsetY
     f. If outlineWidth > 0: ctx.strokeStyle, ctx.lineWidth, ctx.strokeText()
     g. ctx.fillStyle = config.color, ctx.fillText()
  4. Return canvas.toBuffer("image/png")
```

### Auto Font Sizing

- Header base: `canvas.width * 0.08` (8% of image width)
- Footer base: `canvas.width * 0.05` (5% of image width)
- Scale multiplier from user config (0.5 - 1.5)
- If text overflows: reduce font size until it fits within 90% of canvas width, min 60% of base size

---

## Integration Points

The text overlay is a reusable button+modal. User clicks it on any image they want to add text to.

```tsx
<TextOverlayButton
  imageUrl={previewUrl}
  defaultTitle={bookTitle}
  onApply={(base64) => setPreviewUrl(`data:image/png;base64,${base64}`)}
/>
```

### Where to integrate

| File | Location | Default title source |
|------|----------|---------------------|
| `book-detail-page.tsx` | Cover image section | `book.title` |
| `book-detail-page.tsx` | Thumbnail section | `book.title` |
| `cover-thumbnail-step.tsx` | Cover preview | `title` prop |
| `cover-thumbnail-step.tsx` | Square thumbnail preview | `title` prop |

---

## File Structure

### New Files (6)

```
apps/admin/src/
├── components/
│   └── text-overlay-modal.tsx           # ~180 lines — Modal UI + live preview
├── lib/
│   ├── text-overlay/
│   │   ├── text-overlay-types.ts        # ~30 lines — Types
│   │   ├── text-overlay-presets.ts      # ~40 lines — 5 presets + font catalog
│   │   └── google-fonts-loader.ts       # ~60 lines — Fetch/cache TTF server-side
│   └── canvas/
│       └── text-renderer.ts             # ~100 lines — @napi-rs/canvas drawing
├── app/api/generate/
│   ├── text-overlay/
│   │   └── route.ts                     # ~40 lines — Canvas composite endpoint
│   └── text-overlay-blend/
│       └── route.ts                     # ~25 lines — AI blend endpoint
```

### Modified Files (2)

```
apps/admin/src/
├── views/book-detail-page.tsx           # Add TextOverlayButton on cover + thumbnail
├── components/cover-thumbnail-step.tsx  # Add TextOverlayButton on previews
```

### Estimated Total: ~475 lines new code

---

## Dependencies

- `@napi-rs/canvas` — already installed (used by `pdf-renderer.ts`)
- Google Fonts CDN — external, no install needed
- No new npm packages required

---

## Compositing Strategies

### Strategy 1: Canvas Overlay (Default)
- Deterministic, free, instant (~100ms)
- Text sits cleanly on top of image
- Always available

### Strategy 2: AI Blend (Optional)
- Sends canvas-composited image to `editImage()` via Azure GPT-image-2
- Prompt: "Blend the overlaid text naturally into the illustration style while keeping the text readable and correctly spelled"
- Costs tokens (~2k-5k per call)
- Results vary — text may get stylized to match art
- User can compare canvas vs. blend and pick preferred

---

## Edge Cases

| Case | Handling |
|------|----------|
| Very long title | Auto-shrink font until fits 90% width, min 60% of base |
| Empty header + empty footer | Disable "Apply" button |
| Google Fonts CDN unreachable | Error: "Font download failed, try again" |
| Non-Latin characters (Vietnamese, Japanese) | Supported via Google Fonts; fallback to Noto Sans if missing glyphs |
| Very dark/light image | User adjusts via Advanced color controls |
| Source image is data URL | Decode base64 directly, skip download |
| Source image is R2 URL | Download via fetch, normalize URL via `normalizeImageUrl()` |

---

## Success Criteria

- [ ] User can add text overlay to any image (cover or thumbnail) via button
- [ ] Live preview updates instantly when changing text, font, or style
- [ ] 5 presets cover common coloring book styles
- [ ] Advanced controls allow full customization (color, outline, shadow, position, scale)
- [ ] Canvas overlay produces pixel-perfect text with correct font
- [ ] AI Blend option available for organic text integration
- [ ] Google Fonts load and cache correctly on server
- [ ] Non-Latin text (Vietnamese, Japanese) renders correctly
- [ ] Text auto-sizes to fit image width
