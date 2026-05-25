# Coloring Style Management — Design Spec

**Date:** 2026-05-20
**Status:** Approved

## Summary

Add "Coloring Styles" as a standalone entity for extracting color fill techniques from colored reference images and applying them to B&W coloring book pages. This is the counterpart to Art Styles: Art Style controls B&W line generation, Coloring Style controls how those lines get filled with color.

Key decisions:

- Standalone entity with Firestore collection, API routes, admin pages, sidebar nav
- Extract from colored images + manual editing (same pattern as Art Style)
- Autocomplete combobox for all fields (suggestions, not fixed enums)
- Colorize via GPT-image-2 image editing (B&W input image + coloring directive)
- Colorize button on book pages + test colorize on style detail page
- Colored versions stored in R2 alongside originals

## Data Model

### Firestore Collection: `coloringStyles`

```typescript
interface ColoringStyleEntity {
  id: string;
  name: string;
  description: string;

  // Reference images (colored examples, R2 URLs)
  referenceImages: Array<{ url: string; label: string }>; // 1-3
  thumbnailUrl: string;

  // --- Structured Properties (all string, autocomplete suggestions in UI) ---

  medium: {
    technique: string; // suggestions: watercolor, crayon, colored pencil, digital flat, marker, pastel, oil pastel, mixed
    texture: string; // suggestions: smooth, grainy, streaky, blended, rough
    description: string;
  };

  colorPalette: {
    primaryColors: string[]; // hex values ["#FF6B6B", "#4ECDC4"]
    accentColors: string[]; // hex values
    backgroundTone: string; // suggestions: white, cream, warm beige, cool gray, transparent
    warmth: string; // suggestions: warm, cool, neutral
    saturation: string; // suggestions: muted, vibrant, pastel, neon, earthy
    description: string;
  };

  shadingAndLighting: {
    shadingStyle: string; // suggestions: flat, gradient, soft shadow, hard shadow, none
    lightDirection: string; // suggestions: top-left, top-right, ambient, dramatic, none
    highlightTreatment: string; // suggestions: white spots, light areas, none, sparkle
    shadowColorTendency: string; // suggestions: darker shade, purple tint, blue tint, warm brown
    description: string;
  };

  fillBehavior: {
    edgeBleed: string; // suggestions: stay inside lines, slight bleed, artistic overflow
    opacity: string; // suggestions: solid, translucent, layered
    coverage: string; // suggestions: full fill, partial, sketch-like, heavy impasto
    description: string;
  };

  overallFeel: {
    mood: string; // suggestions: cheerful, moody, dreamy, vintage, playful
    ageFeel: string; // suggestions: childlike, professional, artistic, whimsical
    finish: string; // suggestions: matte, glossy, textured, paper-like
    description: string;
  };

  // Colorization directive — injected into GPT-image-2 prompt
  colorizationDirective: string;

  tags: string[];
  sourceBookId?: string;
  createdAt?: string;
  updatedAt?: string;
}
```

### R2 Storage Layout

```
assets/coloring-styles/{id}/
  ref-0.png          # colored reference image
  ref-1.png
  ref-2.png
  thumbnail.png

assets/{bookId}/pages/page-001-colored.png   # colorized book page
```

### Book Page Extension

Existing `coloringPages` array items get two new optional fields:

```typescript
{
  id: string;
  url: string;          // original B&W page
  isPublic: boolean;
  coloredUrl?: string;          // R2 URL of colored version
  coloringStyleId?: string;     // which style was used
}
```

## Extraction Flow (Colored Image → Coloring Style)

### API Route: `POST /api/coloring-styles/analyze`

**Input:** `{ imageUrls: string[] }` (1-3 colored coloring book page URLs)

**Process:**

1. Send images to GPT-4o vision with coloring style extraction prompt
2. Extraction prompt asks AI to analyze coloring technique and return structured properties
3. Auto-generates `colorizationDirective` as explicit rules

**Extraction Prompt Structure:**

Analyzes: medium/technique, color palette (extracts hex values), shading approach, fill behavior, edge treatment, overall feel. Returns JSON matching the entity structure.

The `colorizationDirective` is requested as explicit rules:

```
MEDIUM: Colored pencil with visible grain texture.
PALETTE: Use primarily warm pastels — #FFB5B5 pink, #B5D8FF sky blue, #FFFDD0 cream. Accents in #FF6B6B coral.
SHADING: Soft gradient shadows using darker tones of the base color. Light from top-left.
FILL: Stay precisely inside outlines, solid opacity, full coverage.
EDGES: Clean edge adherence, no bleed beyond outlines.
HIGHLIGHTS: Leave small white spots on rounded surfaces for shine.
MOOD: Cheerful, bright, childlike warmth.
```

**Output:** Full property set + directive + extracted hex colors

## Colorization Flow (B&W → Colored)

### API Route: `POST /api/coloring-styles/colorize`

**Input:**

```typescript
{
  imageUrl: string;          // B&W page URL
  coloringStyleId: string;   // which style to apply
  bookId?: string;           // if from a book, save colored version
  pageId?: string;           // which page in the book
}
```

**Process:**

1. Load coloring style from Firestore
2. Download B&W image
3. Send to GPT-image-2 as image edit:
   - Image input: the B&W page
   - Text: `COLORING RULES (follow exactly): {colorizationDirective}\n\nFill this black and white coloring book page with color following the rules above. Preserve all black outlines. Do not modify the line art.`
4. Upload colored result to R2
5. If bookId + pageId provided, update the book's coloringPages entry with `coloredUrl` and `coloringStyleId`
6. Return `{ success: true, coloredUrl }`

### API Route: `POST /api/coloring-styles/test-colorize`

Same as colorize but:

- No bookId/pageId, no saving to book
- Returns `{ success: true, dataUrl }` (base64 for preview only)
- Shows full prompt in UI

## UI Pages

### Sidebar Nav

Add after Art Styles:

```
Art Styles
Coloring Styles    ← new (icon: faDroplet)
App Home
```

### Coloring Style List Page (`/coloring-styles`)

- Grid layout (same as Art Style list)
- Each card: colored thumbnail, name, medium badge, mood badge, mini color swatches (first 3-4 primaryColors as small circles)
- Search by name/tags
- "Create New" + "Extract from Image" buttons

### Coloring Style Detail Page (`/coloring-styles/[id]`)

- Left panel (sticky):
  - Reference images (colored examples)
  - Test Colorize section:
    - Upload/paste any B&W image
    - "Colorize" button → calls test-colorize API
    - Shows full prompt sent to AI
    - Shows result with PreviewableImage
- Right panel (scrollable):
  - Medium card (technique, texture, description)
  - Color Palette card (hex swatches rendered as colored circles, warmth, saturation, description)
  - Shading & Lighting card
  - Fill Behavior card
  - Overall Feel card
  - Colorization Directive with Copy + Regenerate buttons
  - Tags
- Actions: Edit, Delete

### Coloring Style Create/Edit Page (`/coloring-styles/new`, `/coloring-styles/[id]/edit`)

- Dual mode: Extract from Image / Manual (same as Art Style)
- Autocomplete combobox for all string fields
- Color picker inputs for hex values in primaryColors / accentColors
- "Auto-generate directive" button
- Reference image upload (1-3)

### Colorize Button on Book Detail Page

- On each B&W page thumbnail in the book's coloring pages grid:
  - Small paint-bucket icon button (faDroplet)
  - Click opens a compact modal:
    - Shows the B&W page
    - Coloring Style picker (same pattern as ArtStylePicker)
    - "Colorize" button → calls `/api/coloring-styles/colorize` with bookId + pageId
    - Shows loading state
    - On success: colored image appears, modal can close
  - After colorization, the page card shows both original and colored thumbnail
  - Can re-colorize with a different style (overwrites previous colored version)

### Routes

```
/coloring-styles              → ColoringStyleListPage
/coloring-styles/new          → ColoringStyleCreatePage
/coloring-styles/[id]         → ColoringStyleDetailPage
/coloring-styles/[id]/edit    → ColoringStyleEditPage
```

## API Routes Summary

| Method | Route                                | Purpose                                         |
| ------ | ------------------------------------ | ----------------------------------------------- |
| GET    | `/api/coloring-styles`               | List all                                        |
| GET    | `/api/coloring-styles/[id]`          | Get single                                      |
| POST   | `/api/coloring-styles`               | Create (with R2 upload)                         |
| POST   | `/api/coloring-styles/analyze`       | Extract from colored images via GPT-4o vision   |
| PUT    | `/api/coloring-styles/[id]`          | Update (handles regenerateDirective)            |
| DELETE | `/api/coloring-styles/[id]`          | Delete                                          |
| POST   | `/api/coloring-styles/test-colorize` | Test colorize B&W image (preview only)          |
| POST   | `/api/coloring-styles/colorize`      | Colorize book page (saves to R2 + updates book) |

## Integration Changes

| File                   | Change                                                                           |
| ---------------------- | -------------------------------------------------------------------------------- |
| `app-sidebar.tsx`      | Add "Coloring Styles" nav item with faDroplet icon                               |
| `book-detail-page.tsx` | Add Colorize button per page, coloring style picker modal, show colored versions |
| `crud/books.ts`        | Add `coloredUrl` and `coloringStyleId` to page type                              |

## Backward Compatibility

- Existing books/pages have no `coloredUrl` field — they just don't show a colored version (no migration needed)
- Coloring styles are independent of Art Styles — no coupling between them

## Out of Scope

- Batch colorize entire book at once (can be added later)
- Color palette auto-generation from a theme/mood
- Blending multiple coloring styles
- Real-time color preview (each colorization is a full API call)
