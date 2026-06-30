/**
 * Extraction Prompt — character & location extraction from coloring book images.
 */

export const EXTRACTION_PROMPT = `Analyze this coloring book page image. Extract ALL characters and locations/scenes visible.

Return a JSON object with this exact structure:
{
  "characters": [
    {
      "name": "descriptive name (e.g. Lion with Crown)",
      "type": "animal|character|person|object",
      "role": "main_character|supporting|background",
      "visualDna": {
        "shapeLanguage": "description of shapes and forms",
        "proportions": "size and body proportions",
        "outlineStyle": "line art style",
        "style": "mandala|kawaii|realistic|cartoon|zentangle",
        "colorPalette": ["noted colors if any, or empty for B&W"],
        "facialFeatures": "face description",
        "accessories": ["list of accessories"],
        "distinguishingFeatures": ["unique identifying features"]
      },
      "characterPrompt": "A detailed prompt to recreate ONLY this character as an isolated figure on white background, black and white line art coloring book style. Be very specific about every visual detail.",
      "tags": ["relevant", "tags"]
    }
  ],
  "locations": [
    {
      "name": "descriptive name (e.g. Enchanted Forest)",
      "description": "narrative description of the location",
      "visualDescription": "detailed visual description for image generation",
      "locationPrompt": "A detailed prompt to recreate this location/scene as a coloring book background, black and white line art, no characters, just the environment.",
      "atmosphere": {
        "weather": "weather condition or empty",
        "lighting": "lighting description",
        "timeOfDay": "time of day or empty",
        "mood": "overall mood"
      },
      "props": ["key objects in the scene"],
      "tags": ["relevant", "tags"]
    }
  ]
}

Rules:
- Extract EVERY distinct character, even small background ones
- For locations, describe the overall scene/environment separately from characters
- characterPrompt and locationPrompt must be self-contained — usable to generate a new image without seeing the original
- If the image is mostly a character with minimal background, locations array can be empty
- Tags should be lowercase, useful for search
- Return ONLY valid JSON, no markdown or explanation`;
