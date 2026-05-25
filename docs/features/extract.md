# Character & Location Extraction

## Extraction Flow

1. User uploads a coloring book page
2. AI analyzes the page → extracts characters and locations as JSON metadata
3. For each extracted item, AI generates a reference image using image-to-image extraction from the original page (not text-only)

## Character Extraction

- Passes original page image as visual context (image-to-image)
- Targets specific character by name when multiple exist in the scene
- Full body completion: head, torso, arms, hands, legs, feet — completes hidden parts
- Neutral standing pose facing forward (3/4 view acceptable)
- Clean B&W line art, no shading/gradients/color, coloring book style

## Location Extraction

- Passes original page image as visual context (image-to-image)
- Removes all characters/people from the scene
- Completes hidden background areas behind characters
- Preserves scene perspective, depth, spatial layout

## Redesign Feature

Both character and location detail pages have:

- **Regenerate** button: re-extracts from source image using the stored prompt
- **Redesign** button: opens a text input for custom instructions (e.g. "make the hat bigger", "change to night scene"), appended to the base prompt before regeneration

### API

`PUT /api/characters/:id` and `PUT /api/locations/:id` accept:

- `regenerateReference: true` — triggers re-generation
- `redesignPrompt: string` — optional custom instructions appended to the base prompt

## Coloring Page Generation

- Character and location reference images are passed to the page generation AI
- Structured prompt layers: System Style Rules → Reference Image Policy → Scene → Output Requirements → Conflict Resolution
- Reference images used for identity/features only — style comes from the art style directive
- Full pipeline: StoryPlanner → StoryOutline API (returns per-scene reference URLs) → ColoringPage API (passes images to AI)
