# Art Style Management — Design Spec

**Date:** 2026-05-19
**Status:** Approved

## Summary

Add "Art Styles" as a standalone entity with CRUD, extraction from existing images via AI vision, and integration into the coloring page generation pipeline. Art styles capture the full visual DNA of a coloring book's look — stroke weight, line quality, composition, mood — so pages generated using the same style are visually consistent.

Key decisions:

- Standalone entity with own Firestore collection, API routes, and admin pages
- Extract from image + manual editing (AI fills fields, user tweaks)
- Reference images (2-3 per style) stored in R2, used as visual anchor during generation
- Hybrid data model: enum fields for UI/filtering, description strings for nuance, generation directive for AI prompt injection
- Replaces the current 5-option style dropdown in Story Planner

## Data Model

### Firestore Collection: `artStyles`

```typescript
interface ArtStyleEntity {
  id: string;
  name: string;
  description: string;

  // Reference Images (R2 URLs) — visual anchor for consistent generation
  referenceImages: Array<{ url: string; label: string }>; // 2-3 images
  thumbnailUrl: string; // first reference image or auto-generated

  // --- Structured Properties ---

  lineWork: {
    strokeWeight: "thin" | "medium" | "bold" | "varied";
    lineQuality: "clean" | "sketchy" | "rough" | "organic";
    lineVariation: "uniform" | "tapered" | "calligraphic";
    outlineStyle: "single" | "double" | "broken" | "none";
    hatchingPattern: "none" | "crosshatch" | "stipple" | "parallel";
    description: string;
  };

  composition: {
    density: "sparse" | "moderate" | "dense" | "intricate";
    symmetry: "symmetric" | "asymmetric" | "radial" | "freeform";
    framingStyle: "full-page" | "vignette" | "bordered" | "floating";
    negativeSpace: "generous" | "balanced" | "minimal";
    focalPoint: "centered" | "rule-of-thirds" | "scattered" | "layered";
    description: string;
  };

  formAndShape: {
    shapeLanguage: "geometric" | "organic" | "mixed" | "angular";
    edgeTreatment: "sharp" | "rounded" | "soft" | "mixed";
    proportionStyle: "realistic" | "exaggerated" | "chibi" | "stylized";
    detailLevel: "minimal" | "moderate" | "intricate" | "hyper-detailed";
    description: string;
  };

  moodAndAtmosphere: {
    mood: string;
    energyLevel: "calm" | "moderate" | "dynamic" | "chaotic";
    ageTarget: "toddler" | "kids" | "teen" | "adult" | "all-ages";
    themeCategory: string;
    description: string;
  };

  patternAndTexture: {
    fillPattern: "none" | "zentangle" | "mandala" | "crosshatch" | "dots" | "mixed";
    backgroundTreatment: "blank" | "simple" | "detailed" | "patterned";
    decorativeElements: "none" | "minimal" | "moderate" | "ornate";
    borderStyle: "none" | "simple" | "decorative" | "themed";
    description: string;
  };

  technical: {
    orientation: "portrait" | "landscape" | "square";
    complexityScore: number; // 1-10
    estimatedColoringTime: "5-15min" | "15-30min" | "30-60min" | "60min+";
    description: string;
  };

  // Generation Directive — auto-built from structured fields, manually editable
  // This is the natural language paragraph injected into AI image generation prompts
  generationDirective: string;

  // Metadata
  tags: string[];
  sourceBookId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### R2 Storage Layout

```
assets/art-styles/{id}/
  ref-0.png          # primary reference image
  ref-1.png          # secondary reference
  ref-2.png          # tertiary reference (optional)
  thumbnail.png      # auto-generated or cropped from ref-0
```

### Book Entity Change

Add `artStyleId?: string` field to BookEntity. Optional — existing books without it use the legacy hardcoded coloring page suffix.

## Extraction Flow (Image → Art Style)

### API Route: `POST /api/art-styles/analyze`

**Input:** `{ imageUrls: string[] }` (1-3 image URLs)

**Process:**

1. Send images to GPT-4o vision with art style extraction prompt
2. Extraction prompt asks the AI to analyze and return all structured property groups
3. Auto-generate `generationDirective` from the structured properties

**Extraction Prompt Structure:**

```
Analyze the art style of these coloring book pages. Extract detailed visual properties.

Return JSON:
{
  "name": "suggested name based on style",
  "description": "one-paragraph summary",
  "lineWork": { strokeWeight, lineQuality, lineVariation, outlineStyle, hatchingPattern, description },
  "composition": { density, symmetry, framingStyle, negativeSpace, focalPoint, description },
  "formAndShape": { shapeLanguage, edgeTreatment, proportionStyle, detailLevel, description },
  "moodAndAtmosphere": { mood, energyLevel, ageTarget, themeCategory, description },
  "patternAndTexture": { fillPattern, backgroundTreatment, decorativeElements, borderStyle, description },
  "technical": { orientation, complexityScore, estimatedColoringTime, description },
  "generationDirective": "complete natural language paragraph describing how to reproduce this exact style...",
  "tags": ["relevant", "tags"]
}

For each enum field, use ONLY the allowed values: [list exact options per field].
For description fields, write 1-2 sentences capturing nuances the enums can't express.
For generationDirective, write a detailed paragraph an AI image generator can follow to reproduce this style exactly — include specific line weights, curve tensions, detail density, spacing patterns, and visual character.
```

**Output:** Full ArtStyleEntity (minus id, timestamps, referenceImages)

### API Route: `POST /api/art-styles`

**Input:** Structured properties + uploaded reference images

**Process:**

1. Create Firestore doc to get ID
2. Upload reference images to R2 at `assets/art-styles/{id}/ref-{n}.png`
3. Set thumbnailUrl to first reference image URL
4. Update Firestore doc with R2 URLs

### API Route: `PUT /api/art-styles/[id]`

**Input:** Updated properties and/or new reference images

**Process:**

1. If new reference images provided, upload to R2 (overwrite existing keys)
2. Update Firestore doc

### API Route: `PUT /api/art-styles/[id]` with `regenerateDirective: true`

**Process:**

1. Read current structured properties from Firestore
2. Send to GPT-4o: "Given these art style properties, write a generation directive paragraph..."
3. Update `generationDirective` field

## Generation Flow (Art Style → New Pages)

### Current Flow (to be replaced)

```typescript
// story-planner-step.tsx
const STYLE_OPTIONS = [
  { value: "cartoon", label: "Cartoon" },
  { value: "mandala", label: "Mandala" },
  // ...5 options
];

// image-provider.ts
export async function generateColoringPage(prompt: string): Promise<GeneratedImage> {
  return generateImage(
    `${prompt}. Black and white line art, coloring book page, clean outlines, no shading, no color fill, white background, suitable for coloring.`,
  );
}
```

### New Flow

```typescript
// story-planner-step.tsx
// Replace STYLE_OPTIONS dropdown with ArtStylePicker component
// Selected art style ID stored in state, passed to generation

// image-provider.ts — new function signature
export async function generateColoringPage(
  prompt: string,
  artStyle?: { referenceImageUrls: string[]; generationDirective: string },
): Promise<GeneratedImage> {
  if (artStyle) {
    // Send reference images + directive + scene prompt to GPT-image-2
    // Reference images as image_url content parts
    // Text: "{prompt}. {generationDirective}"
  } else {
    // Legacy fallback: hardcoded suffix
    return generateImage(`${prompt}. Black and white line art, coloring book page...`);
  }
}
```

### Generation Call Structure

```
GPT-image-2 request:
  messages: [
    { role: "user", content: [
      { type: "image_url", image_url: { url: referenceImage1 } },
      { type: "image_url", image_url: { url: referenceImage2 } },
      { type: "text", text: "Generate a coloring book page matching the exact art style of the reference images above. {generationDirective}. Scene: {scenePrompt}" }
    ]}
  ]
```

Note: GPT-image-2 supports image inputs for style transfer. The reference images serve as the visual anchor — the generation directive reinforces specific properties in text.

### Story Outline Integration

The `/api/generate/story-outline` prompt currently receives `Art style: ${style}` (a single word like "kawaii"). This changes to receive the full `generationDirective` text, giving the story planner richer context for composing scene prompts that match the style.

## UI Pages

### Sidebar Nav

Add between Locations and App Home:

```
Books
Categories
Characters
Locations
Art Styles    ← new (icon: faPalette)
App Home
Wallets
Credit Ledger
```

### Art Style List Page (`/art-styles`)

- Grid layout (not table — visual content needs thumbnails)
- Each card: thumbnail, name, tags, complexity score badge, age target badge
- Search by name/tags
- Filter by: age target, energy level, complexity range
- Actions: View, Delete
- Two creation buttons: "Create New" (manual) + "Extract from Image"

### Art Style Detail Page (`/art-styles/[id]`)

- Left panel (sticky): reference images gallery with lightbox
- Right panel (scrollable): property sections as cards
  - Line Work, Composition, Form & Shape, Mood & Atmosphere, Pattern & Texture, Technical
  - Enum values shown as badges
  - Descriptions as text
  - Generation Directive in highlighted block with Copy button
- Actions: Edit, Delete, Duplicate, Regenerate Directive
- "Test Generate" button: generate a sample page using this style to preview consistency

### Art Style Create/Edit Page (`/art-styles/new`, `/art-styles/[id]/edit`)

- Two creation modes toggled at top:
  - "Extract from Image" — upload 1-3 images → AI analyzes → fills all fields → user reviews/edits
  - "Manual" — empty form
- Form sections matching data model groups
- Enum fields: select dropdowns
- Description fields: textarea
- Generation Directive: large textarea with "Auto-generate from properties" button
- Reference images: drag-and-drop upload area (1-3 images)

### Art Style Picker Component

- Used in Story Planner step (replaces STYLE_OPTIONS dropdown)
- Compact view: thumbnail + name + complexity badge
- Click opens modal with full grid to browse library
- Selected style shown as card preview with key properties

### Routes

```
/art-styles              → ArtStyleListPage
/art-styles/new          → ArtStyleCreatePage
/art-styles/[id]         → ArtStyleDetailPage
/art-styles/[id]/edit    → ArtStyleEditPage
```

## API Routes Summary

| Method | Route                     | Purpose                                             |
| ------ | ------------------------- | --------------------------------------------------- |
| GET    | `/api/art-styles`         | List all art styles                                 |
| GET    | `/api/art-styles/[id]`    | Get art style details                               |
| POST   | `/api/art-styles`         | Create art style (with R2 upload)                   |
| POST   | `/api/art-styles/analyze` | Extract style from images via AI vision             |
| PUT    | `/api/art-styles/[id]`    | Update art style (handles regenerateDirective flag) |
| DELETE | `/api/art-styles/[id]`    | Delete art style + R2 assets                        |

## Integration Changes

| File                                   | Change                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `app-sidebar.tsx`                      | Add "Art Styles" nav item with faPalette icon                                                   |
| `story-planner-step.tsx`               | Replace STYLE_OPTIONS dropdown with ArtStylePicker                                              |
| `image-provider.ts`                    | Add `artStyle` parameter to `generateColoringPage()` with reference image + directive injection |
| `prompts.ts`                           | Add `ART_STYLE_EXTRACTION_PROMPT`                                                               |
| `crud/books.ts`                        | Add `artStyleId` field to BookEntity                                                            |
| `/api/generate/story-outline/route.ts` | Accept full `generationDirective` instead of simple style string                                |

## Backward Compatibility

- Existing books without `artStyleId` keep working — `generateColoringPage()` falls back to hardcoded suffix
- Existing story outlines generated with old style enum still render
- No migration needed for existing data

## Out of Scope

- Style versioning (history of changes to a style)
- Style sharing/marketplace between users
- Auto-applying style to existing books retroactively
- Style blending (combining two styles)
