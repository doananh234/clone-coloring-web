# AI Book Metadata Generation from Thumbnail

**Date:** 2026-06-08
**Status:** Approved

## Problem

When creating/editing coloring books, admins manually fill in metadata fields (title, subtitle, badge, colors, tags, Etsy listing content). This is tedious and inconsistent. The system already has Azure OpenAI vision capabilities — we should use them to auto-generate metadata from the book's thumbnail/cover image.

## Solution

Add a "Generate with AI" button in the book edit form that analyzes the current cover/thumbnail via `visionAnalyzeJSON()` and presents generated metadata in a preview modal for selective application.

## Data Model Changes

### New top-level fields on BookEntity

These fields are useful beyond Etsy — for display, filtering, and search:

```typescript
tags?: string[];           // 13 search keywords
primaryColor?: string;     // dominant color theme ("Black", "Blue", "Pink", etc.)
secondaryColor?: string;   // secondary color ("White", "None", etc.)
themeStyle?: string;       // art/visual style ("Kawaii", "Minimalist", "Detailed", etc.)
holiday?: string;          // seasonal relevance ("Christmas", "None", etc.)
occasion?: string;         // use case ("Birthday", "Back to School", "None", etc.)
```

### New nested field on BookEntity

Etsy-specific commerce metadata:

```typescript
etsyListing?: {
  etsyTitle?: string;          // SEO-optimized 140-char title
  etsyDescription?: string;    // 800-1500 word Etsy description
  materials?: string[];        // ["Digital PDF", "Printable"]
  etsyCategory?: string;       // "Art & Collectibles > Drawing & Illustration > Digital"
  subcategory?: string;        // "Coloring Pages"
  priceSuggestionUsd?: number; // 2.99 - 9.99
  priceNotes?: string;         // 1-2 sentence rationale
  section?: string;            // shop section suggestion
  generatedAt?: string;        // ISO timestamp
};
```

No Firestore migration needed — schemaless.

## API Endpoint

### POST /api/generate/book-meta

**Request:**
```typescript
{ thumbnailUrl: string; bookId?: string; }
```

**Flow:**
1. Validate `thumbnailUrl` exists
2. Call `visionAnalyzeJSON()` with structured prompt + thumbnail
3. Return generated metadata

**Response:**
```typescript
{
  success: true;
  data: {
    // Suggested top-level fields
    title: string;
    subtitle: string;
    badge: string;
    backgroundColor: string;
    // New top-level fields
    tags: string[];
    primaryColor: string;
    secondaryColor: string;
    themeStyle: string;
    holiday: string;
    occasion: string;
    // Nested Etsy listing
    etsyListing: {
      etsyTitle: string;
      etsyDescription: string;
      materials: string[];
      etsyCategory: string;
      subcategory: string;
      priceSuggestionUsd: number;
      priceNotes: string;
      section: string;
      generatedAt: string;
    };
  };
}
```

## Prompt Design

Single structured prompt to `visionAnalyzeJSON()` that:
- Analyzes the coloring book thumbnail visually
- Extracts dominant/secondary colors from the image
- Identifies art style, theme, characters, scenes
- Generates marketable title/subtitle
- Suggests appropriate badge based on visual appeal
- Generates Etsy-optimized listing content:
  - SEO title (max 140 chars, includes "Coloring Book")
  - Long description (800-1500 words, anti-AI phrasing, includes printing tips)
  - Exactly 13 tags (mix broad + long-tail)
  - Category path, subcategory, price suggestion
- Returns all fields as structured JSON

Anti-AI phrasing rules (from Book-AI):
- No "Welcome to", "Unleash your creativity", "Perfect for", "Dive into"
- Use natural contractions, varied paragraph length
- Reference specific visual details from the thumbnail

## UI Flow

### Generate Button
- Located near top of book edit form
- Visible only when `coverUrl` or `thumbnailUrl` exists
- Shows loading spinner with "Analyzing thumbnail..." during generation

### Preview Modal (BookMetaPreviewModal)
- Two-column layout: "Current Value" vs "AI Generated"
- Fields grouped into 3 sections:
  - **General:** title, subtitle, badge, backgroundColor
  - **Discovery:** tags, primaryColor, secondaryColor, themeStyle, holiday, occasion
  - **Etsy Listing:** etsyTitle, etsyDescription, materials, etsyCategory, subcategory, priceSuggestionUsd, priceNotes, section
- Each field row has a checkbox (all checked by default)
- User unchecks fields they don't want overwritten
- "Apply Selected" button populates checked values into the form
- "Cancel" closes without changes

### Tags display
- Pill/chip UI showing each tag
- Count indicator (target: 13)

### Etsy description
- Scrollable text area in preview (long content)

## Files to Create/Modify

| Action | File | Purpose |
|---|---|---|
| **Modify** | `apps/admin/src/crud/books.ts` | Add new fields to BookEntity type + FieldConfig array |
| **Create** | `apps/admin/src/app/api/generate/book-meta/route.ts` | API endpoint |
| **Create** | `apps/admin/src/lib/ai/prompts/book-meta-prompt.ts` | Prompt template |
| **Create** | `apps/admin/src/components/book-meta-preview-modal.tsx` | Preview/diff modal |
| **Modify** | Book edit form (via CRUD generator or custom component) | Add "Generate with AI" button |
| **Modify** | `apps/admin/src/i18n/locales/en/books.json` | Labels for new fields |
| **Modify** | `apps/admin/src/i18n/locales/vi/books.json` | Labels for new fields |
| **Modify** | `apps/admin/src/i18n/locales/ja/books.json` | Labels for new fields |

## Technical Decisions

- **AI Provider:** Azure OpenAI `visionAnalyzeJSON()` — already set up, used elsewhere in codebase
- **Single API call:** All fields generated in one round-trip (~3-5s)
- **Preview modal:** User sees current vs generated, selects which fields to apply
- **No streaming:** Acceptable latency for single-call approach
- **Firestore:** No schema migration — just update TypeScript types

## Out of Scope

- Batch generation for multiple books
- Auto-generation on thumbnail upload (explicit button only)
- Etsy API push/sync (copy-paste workflow)
- Shop-level Etsy store kit (brand-level, separate feature)
