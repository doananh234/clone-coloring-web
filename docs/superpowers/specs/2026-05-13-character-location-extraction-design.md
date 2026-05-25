# Character & Location Extraction — Design Spec

**Date:** 2026-05-13
**Status:** Approved
**Scope:** AI-powered extraction of characters and locations from coloring book pages to build reusable dataset for new book generation.

---

## 1. Overview

Analyze existing coloring book pages with Azure GPT-4o Vision to extract characters and locations. Build a searchable library that can be used as building blocks to generate new books by combining characters + locations into prompts.

**AI Service:** Azure OpenAI GPT-4o Vision (already configured)

---

## 2. Firestore Collections

### `characters` collection

| Field               | Type          | Description                                                                                |
| ------------------- | ------------- | ------------------------------------------------------------------------------------------ |
| `id`                | string (auto) | Document ID                                                                                |
| `name`              | string        | "Lion with Crown"                                                                          |
| `type`              | string        | "animal" / "character" / "person" / "object"                                               |
| `role`              | string        | "main_character" / "supporting" / "background"                                             |
| `visualDna`         | object        | Shape language, proportions, style, colors, features, accessories, distinguishing features |
| `characterPrompt`   | string        | Full AI text prompt to recreate this character from scratch                                |
| `referenceImageUrl` | string        | AI-generated clean isolated image of just this character                                   |
| `tags`              | string[]      | ["animal", "mandala", "royal"]                                                             |
| `category`          | string        | "animals"                                                                                  |
| `sourceBookId`      | string        | Book this was extracted from                                                               |
| `sourcePageId`      | string        | Page ID within the book                                                                    |
| `sourceImageUrl`    | string        | Full page image URL                                                                        |
| `createdAt`         | Timestamp     |                                                                                            |
| `updatedAt`         | Timestamp     |                                                                                            |

### `locations` collection

| Field               | Type          | Description                                        |
| ------------------- | ------------- | -------------------------------------------------- |
| `id`                | string (auto) | Document ID                                        |
| `name`              | string        | "Enchanted Forest"                                 |
| `description`       | string        | Narrative description                              |
| `visualDescription` | string        | Full visual description for image generation       |
| `locationPrompt`    | string        | Full AI text prompt to recreate this location      |
| `referenceImageUrl` | string        | AI-generated clean isolated image of this location |
| `atmosphere`        | object        | weather, lighting, timeOfDay, mood                 |
| `props`             | string[]      | Key objects in this location                       |
| `tags`              | string[]      | ["nature", "fantasy", "forest"]                    |
| `sourceBookId`      | string        |                                                    |
| `sourcePageId`      | string        |                                                    |
| `sourceImageUrl`    | string        | Full page image URL                                |
| `createdAt`         | Timestamp     |                                                    |
| `updatedAt`         | Timestamp     |                                                    |

---

## 3. Extraction Workflow

### Trigger

Per-page extraction. User selects specific pages from the book detail lightbox. "Extract" button in lightbox metadata bar.

### Flow

1. **Vision Analysis** — send full page image to Azure GPT-4o Vision. Returns structured JSON: characters[] and locations[] with names, visualDna, prompts, tags.
2. **Review Modal** — user sees extraction results inline. Can edit names, remove false positives, adjust tags. Clicks "Save to Library".
3. **Generate Reference Images** — for each saved character/location, call Azure image generation with the characterPrompt/locationPrompt to create a clean isolated reference image. Upload to R2 or Firebase Storage.
4. **Save to Firestore** — create documents in `characters`/`locations` collections with all fields including referenceImageUrl.

---

## 4. API Routes

| Route                         | Method         | Description                                            |
| ----------------------------- | -------------- | ------------------------------------------------------ |
| `/api/extract/analyze`        | POST           | Send image URL, get characters[] + locations[] JSON    |
| `/api/extract/save-character` | POST           | Save character to Firestore + generate reference image |
| `/api/extract/save-location`  | POST           | Save location to Firestore + generate reference image  |
| `/api/characters`             | GET            | List characters with search/filter                     |
| `/api/characters/[id]`        | GET/PUT/DELETE | Character CRUD                                         |
| `/api/locations`              | GET            | List locations with search/filter                      |
| `/api/locations/[id]`         | GET/PUT/DELETE | Location CRUD                                          |

---

## 5. UI Pages & Components

### 5a. Lightbox Enhancement

Add "Extract" button in lightbox metadata bar (next to Public/Private toggle). On click, calls analyze API and opens extraction review modal.

### 5b. Extraction Review Modal

Full-screen modal showing:

- Source image on left
- Extracted results on right, grouped: **Characters** section + **Locations** section
- Each item: name (editable), type/role dropdowns, tags (editable chips), prompt preview (expandable)
- Checkbox to select which items to save
- "Save Selected to Library" button

### 5c. Characters Library Page (`/characters`)

Card grid layout (similar to books list):

- Each card: reference image thumbnail, name, type badge, tag chips, source book link
- Search by name/tags
- Filter pills: All, Animal, Character, Person, Object
- Click card → detail view

### 5d. Character Detail Page (`/characters/[id]`)

Split panel:

- Left: reference image (large), source image (smaller)
- Right: name, type, role, visual DNA details, character prompt (copyable), tags, source book link
- Edit button, Delete button
- "Generate New Image" button (re-generate reference from prompt)

### 5e. Locations Library Page (`/locations`)

Same pattern as characters. Filter pills: All, Nature, Indoor, Urban, Fantasy.

### 5f. Location Detail Page (`/locations/[id]`)

Split panel:

- Left: reference image, source image
- Right: name, description, visual description, atmosphere details, props list, location prompt, tags, source book link

### 5g. Book Creation Integration

Book creation wizard Step 3 (Page Prompts):

- "Browse Characters" button → opens picker modal showing character library
- "Browse Locations" button → opens picker modal showing location library
- Selecting character + location auto-generates prompt: "{characterPrompt}, in {locationPrompt}, black and white coloring book page, clean outlines"

---

## 6. Sidebar Navigation Update

Add after Categories:

```
Books
Categories
Characters    ← new
Locations     ← new
App Home
Wallets
Credit Ledger
```

---

## 7. Implementation Files

### API Routes

- `app/api/extract/analyze/route.ts` — Vision analysis
- `app/api/extract/save-character/route.ts` — Save + generate reference
- `app/api/extract/save-location/route.ts` — Save + generate reference
- `app/api/characters/route.ts` — List characters
- `app/api/characters/[id]/route.ts` — Character CRUD
- `app/api/locations/route.ts` — List locations
- `app/api/locations/[id]/route.ts` — Location CRUD

### Pages

- `app/(dashboard)/characters/page.tsx` — Library grid
- `app/(dashboard)/characters/[id]/page.tsx` — Detail
- `app/(dashboard)/locations/page.tsx` — Library grid
- `app/(dashboard)/locations/[id]/page.tsx` — Detail

### Components

- `components/extraction-review-modal.tsx` — Review extracted results
- `pages/character-list-page.tsx` — Characters library
- `pages/character-detail-page.tsx` — Character detail
- `pages/location-list-page.tsx` — Locations library
- `pages/location-detail-page.tsx` — Location detail

### Modified Files

- `components/image-lightbox.tsx` — Add "Extract" button
- `pages/book-create-page.tsx` — Add character/location picker in step 3
- `app-sidebar.tsx` — Add Characters + Locations nav items
