/**
 * Story Outline Prompt — generates a multi-page story outline for coloring books.
 */

export function buildStoryOutlinePrompt(params: {
  title: string;
  description?: string;
  pageCount: number;
  characters: { name: string; characterPrompt: string }[];
  locations: { name: string; locationPrompt: string }[];
  style: string;
}): string {
  const { title, description, pageCount, characters, locations, style } = params;

  const charList =
    characters.length > 0
      ? characters.map((c) => `- ${c.name}: ${c.characterPrompt}`).join("\n")
      : "No characters provided — invent 2-3 characters that fit the title.";

  const locList =
    locations.length > 0
      ? locations.map((l) => `- ${l.name}: ${l.locationPrompt}`).join("\n")
      : "No locations provided — invent 3-4 locations that fit the title.";

  return `You are a coloring book story planner. Generate a ${pageCount}-page story outline for a coloring book titled "${title}".${description ? ` Description: ${description}` : ""}

Art style: ${style}

CHARACTERS:
${charList}

LOCATIONS:
${locList}

RULES (you MUST follow ALL of these):

1. LOCATION MODIFIERS: Each scene visit to a base location MUST have a unique modifier. Use combinations of:
   - Time: dawn, morning, noon, afternoon, dusk, night, midnight
   - Weather: sunny, cloudy, rainy, snowy, windy, stormy, foggy, misty
   - Season: spring blossoms, summer heat, autumn leaves, winter frost
   - Event: festival, discovery, storm passing, celebration, secret revealed
   You can combine or invent new modifiers. Same base location must NEVER look the same twice.

2. SCENE ELEMENTS: Each scene MUST have 3-5 small unique physical props/details. Examples:
   - Natural: fallen log, mushroom cluster, wildflowers, bird nest, stepping stones, vines
   - Man-made: lantern, wooden sign, rope bridge, old well, treehouse, fence
   - Magical: glowing crystals, floating orbs, enchanted mirror, portal, treasure chest
   - Interactive: picnic blanket, fishing rod, campfire, kite, musical instrument
   Scene elements MUST be different for every visit to the same base location.

3. CHARACTER GROUPINGS: Vary across pages:
   - ~30% solo character scenes
   - ~40% pair/small group scenes
   - ~30% full group scenes
   - Never same exact grouping 2 pages in a row

4. ACTIVITY VARIATION: Every page MUST have a different activity. Never repeat.
   Examples: exploring, playing, eating, sleeping, discovering, building, flying, swimming, climbing, hiding, celebrating, reading, cooking, gardening, painting, dancing, fishing, running, singing, crafting

5. STORY ARC: Distribute scenes across acts:
   - Intro (first 20%): characters introduced, calm mood
   - Adventure (next 40%): exploration, discovery, increasing complexity
   - Climax (next 20%): challenge, dramatic scenes, peak energy
   - Resolution (final 20%): peaceful conclusion, celebration, rest

6. COMPOSITION VARIETY: Alternate between:
   - Wide/establishing shots
   - Medium shots (character + environment)
   - Close-up character portraits
   - Overhead/bird's eye views
   - Low angle dramatic views

Return a JSON object:
{
  "scenes": [
    {
      "sceneNumber": 1,
      "locationName": "location name from list above",
      "locationModifier": "unique modifier for this visit",
      "sceneElements": ["prop1", "prop2", "prop3", "prop4"],
      "characterNames": ["char1"],
      "activity": "specific activity description",
      "mood": "emotional mood",
      "composition": "shot type and framing"
    }
  ]
}

Return ONLY valid JSON. Generate exactly ${pageCount} scenes.`;
}
