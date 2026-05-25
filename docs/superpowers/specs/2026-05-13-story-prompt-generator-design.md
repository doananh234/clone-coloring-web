# Story-Driven Prompt Generator — Design Spec

**Date:** 2026-05-13
**Status:** Approved
**Scope:** Auto-generate a sequence of varied coloring page prompts from a book concept using story planning.

---

## 1. Overview

Replace manual prompt writing in the book creation wizard with an AI story planner. User provides title + characters + locations + page count → AI generates a story outline with enforced variety → each scene becomes an image prompt. Two-step process: outline first (reviewable), then image prompts.

---

## 2. User Input

| Field       | Required | Description                                              |
| ----------- | -------- | -------------------------------------------------------- |
| Title       | yes      | Book title                                               |
| Description | no       | Optional context for the AI                              |
| Page count  | yes      | 10-50 (slider or input)                                  |
| Characters  | no       | Selected from character library (name + characterPrompt) |
| Locations   | no       | Selected from location library (name + locationPrompt)   |
| Style       | yes      | mandala / kawaii / realistic / zentangle / cartoon       |

If no characters/locations selected, AI invents them from the title.

---

## 3. Story Outline Generation

### Two-step process

**Step 1: LLM generates story outline** — structured JSON with enforced rules.
**Step 2: LLM converts each scene → full image prompt** — combining character/location/activity/style.

### Scene structure

Each scene in the outline:

```json
{
  "sceneNumber": 1,
  "locationName": "Enchanted Forest",
  "locationModifier": "at sunrise with morning mist rising between ancient oaks",
  "sceneElements": [
    "fallen log bridge",
    "glowing mushroom cluster",
    "butterflies",
    "wildflower patch"
  ],
  "characterNames": ["Lion"],
  "activity": "discovering a hidden path between ancient trees",
  "mood": "curious and wonder",
  "composition": "wide shot, character small in frame, path leading into distance"
}
```

`sceneElements` are 3-5 small physical props/details unique to this visit — foreground objects, plants, decorations, interactive items. They add visual variety and coloring detail even when the base location and mood are similar. AI must never repeat the same scene elements across visits to the same location.

### Enforced variety rules (baked into LLM prompt)

**Location modifiers** — each visit to a base location MUST have a unique modifier. Modifier categories as guidance:

- **Time:** dawn, morning, noon, afternoon, dusk, night, midnight
- **Weather:** sunny, cloudy, rainy, snowy, windy, stormy, foggy, misty
- **Season:** spring blossoms, summer heat, autumn leaves, winter frost
- **Event:** festival, discovery, arrival of new character, storm passing, celebration, secret revealed
- **Detail:** new landmark discovered, different angle/perspective, seasonal decoration, magical transformation

AI can combine categories or invent new ones. The rule: same base location must look visually distinct each visit.

**Scene elements** — 3-5 small physical props/details unique to each scene visit. These are foreground objects, plants, decorations, or interactive items that add coloring detail. Examples:

- Natural: fallen log, mushroom cluster, wildflowers, bird nest, stepping stones, vines
- Man-made: lantern, wooden sign, rope bridge, old well, treehouse, fence
- Magical: glowing crystals, floating orbs, enchanted mirror, portal, treasure chest
- Interactive: picnic blanket, fishing rod, campfire, kite, musical instrument

Scene elements MUST be different for every visit to the same base location. They appear in the final image prompt to give the illustrator specific small details to draw.

**Character groupings** — vary across pages:

- Solo character scenes (30%)
- Pair/small group scenes (40%)
- Full group scenes (30%)
- Never same exact grouping 2 pages in a row

**Activity variation** — never repeat the same activity. Examples: exploring, playing, eating, sleeping, discovering, building, flying, swimming, climbing, hiding, celebrating, reading, cooking, gardening, painting, dancing.

**Story arc** — distribute scenes across acts:

- **Intro (first 20%)** — characters introduced in their locations, calm mood
- **Adventure (next 40%)** — exploration, discovery, increasing complexity
- **Climax (next 20%)** — challenge, dramatic scenes, peak energy
- **Resolution (final 20%)** — peaceful conclusion, celebration, rest

**Composition variety** — alternate between:

- Wide/establishing shots
- Medium shots (character + environment)
- Close-up character portraits
- Overhead/bird's eye views
- Low angle dramatic views

---

## 4. Outline → Image Prompts

After outline is generated (and optionally edited by user), each scene is converted to a full image prompt:

```
{characterPrompt from library} +
{locationPrompt from library} modified by {locationModifier} +
{activity description} +
{composition instruction} +
{style suffix: "black and white line art, coloring book page, clean outlines"}
```

This uses the existing `buildCombinedPagePrompt()` pattern but enhanced with modifiers.

---

## 5. UI Integration

### Book Creation Wizard — Updated Step 3

Replace current "Page Prompts" step with "Story Planner":

**Top section:** Input controls

- Character picker (from library, multi-select chips)
- Location picker (from library, multi-select chips)
- Page count slider (10-50)
- Style selector (combobox)
- "Generate Story Outline" button

**Middle section:** Collapsible outline preview (after generation)

- Table/list view: # | Location + Modifier | Characters | Activity | Mood
- Each row editable inline (click to edit)
- Drag to reorder
- "Regenerate" button for full re-roll
- "Regenerate Scene" button per row

**Bottom section:** Generated prompts (after converting outline)

- Same as current Step 4 — list of prompts with preview thumbnails
- "Convert to Prompts" button transforms outline → final prompts

---

## 6. API Route

### `POST /api/generate/story-outline`

Input:

```json
{
  "title": "Forest Animals Adventure",
  "description": "A magical journey through enchanted woods",
  "pageCount": 20,
  "characters": [
    { "name": "Lion King", "characterPrompt": "A majestic lion with flowing mane..." }
  ],
  "locations": [
    { "name": "Enchanted Forest", "locationPrompt": "Dense forest with ancient oak trees..." },
    { "name": "Crystal Lake", "locationPrompt": "Serene lake with crystal clear water..." }
  ],
  "style": "mandala"
}
```

Output:

```json
{
  "success": true,
  "outline": [
    {
      "sceneNumber": 1,
      "locationName": "Enchanted Forest",
      "locationModifier": "at sunrise with morning mist rising between ancient oaks",
      "sceneElements": [
        "fallen log bridge",
        "glowing mushroom cluster",
        "butterflies",
        "wildflower patch"
      ],
      "characterNames": ["Lion King"],
      "activity": "stepping through a grand archway of intertwined branches",
      "mood": "wonder",
      "composition": "wide establishing shot"
    }
  ],
  "prompts": [
    "A majestic lion with flowing mane..., stepping through a grand archway of intertwined branches in a dense forest with ancient oak trees at sunrise with morning mist rising between ancient oaks, wide establishing shot, mandala style, black and white line art, coloring book page, clean outlines"
  ]
}
```

Returns both outline (for preview/editing) and pre-built prompts (for immediate use).

---

## 7. New Prompt Template

Added to `lib/ai/prompts.ts` as `buildStoryOutlinePrompt()`:

Takes title, description, characters[], locations[], pageCount, style → returns a detailed system prompt that enforces all variety rules. The LLM returns structured JSON.

---

## 8. Implementation Files

### New

- `apps/admin/src/app/api/generate/story-outline/route.ts` — story outline API
- `apps/admin/src/lib/ai/prompts.ts` — add `buildStoryOutlinePrompt()`
- `apps/admin/src/components/story-outline-editor.tsx` — inline outline table with edit/reorder

### Modified

- `apps/admin/src/pages/book-create-page.tsx` — replace Step 3 with Story Planner UI

---

## 9. Character/Location Picker

In the Story Planner step, user picks characters and locations from their library:

- "Add Characters" button → opens a simple picker (fetch from `/api/characters`, show as selectable chips with thumbnails)
- "Add Locations" button → same for locations
- Selected items shown as removable chips above the outline
- If library is empty, show "No characters yet — the AI will invent characters for your story" message
