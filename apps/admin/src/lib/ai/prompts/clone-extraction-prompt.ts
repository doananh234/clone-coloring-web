export const CLONE_EXTRACTION_PROMPT = `You are analyzing a coloring book page to extract a SCENE DESCRIPTION that can reproduce a very similar page.

Your goal is NOT to create reusable character/location cards. Your goal is to describe EXACTLY what is in THIS image so we can regenerate it as a new coloring page.

Return JSON with this EXACT structure (no markdown, no extra text):
{
  "scene": {
    "description": "Detailed scene summary: who is doing what, where, in what pose/arrangement. Example: 'A little girl in a puffy dress sits cross-legged on a garden path reading a book, with her cat curled up beside her. Butterflies float around them. Flower bushes frame both sides.'",
    "cameraView": "wide|medium|close-up|bird-eye|low-angle",
    "composition": "Exact layout: where each element is positioned. Example: 'Girl centered, cat to her right, path leading from bottom-center to background, flower bushes on left and right edges, butterflies scattered in upper third'"
  },
  "environment": {
    "timeOfDay": "day|night|dawn|dusk",
    "weather": "sunny|cloudy|rainy|snowy|indoor",
    "season": "spring|summer|autumn|winter|neutral",
    "mood": "peaceful|adventurous|mysterious|playful|dramatic"
  },
  "characters": [
    {
      "name": "short identifier (e.g., 'girl', 'cat')",
      "type": "person|animal|fantasy|object",
      "role": "main_character|supporting|background",
      "visualDna": {
        "shapeLanguage": "rounded|angular|mixed",
        "proportions": "chibi|realistic|stylized",
        "outlineStyle": "thick|thin|varied",
        "style": "cartoon|realistic|kawaii|mandala|zentangle",
        "facialFeatures": "exact face/expression in this image",
        "accessories": ["items worn/carried in THIS scene"],
        "distinguishingFeatures": ["visual traits visible in THIS image"]
      },
      "characterPrompt": "Describe THIS character EXACTLY as they appear in THIS image. Include: exact pose (sitting/standing/running, which direction facing), exact clothing (puffy dress with bow, striped shirt), exact expression (smiling with eyes closed, looking surprised), exact body proportions (large head, small body = chibi), hair style and details. This prompt must reproduce the character in the SAME pose and appearance.",
      "tags": ["relevant", "searchable", "tags"]
    }
  ],
  "locations": [
    {
      "name": "location name (e.g., 'garden path')",
      "description": "Brief one-line description",
      "visualDescription": "Describe the background EXACTLY as drawn: what elements are where, how detailed, what art style. Include foreground/midground/background layers.",
      "locationPrompt": "Describe THIS background EXACTLY as it appears. Include: ground surface (cobblestone path, grass field), left side elements (3 rose bushes), right side elements (wooden fence), background elements (hills with 2 trees), sky treatment (clouds or blank). Must reproduce the same spatial layout.",
      "atmosphere": {
        "weather": "clear|cloudy|rainy|snowy|foggy",
        "lighting": "bright|soft|dramatic|dim|dappled",
        "timeOfDay": "morning|afternoon|evening|night",
        "mood": "serene|mysterious|cheerful|dramatic"
      },
      "props": ["background objects and decorative elements"],
      "tags": ["relevant", "searchable", "tags"]
    }
  ],
  "props": [
    {
      "name": "prop name (e.g., 'open book', 'bicycle')",
      "position": "exact position (e.g., 'on girl lap center-foreground', 'leaning on fence right-midground')",
      "interaction": "how it relates to characters (e.g., 'girl is reading it', 'parked next to her')"
    }
  ]
}

CRITICAL RULES FOR REPRODUCTION QUALITY:
1. CHARACTER PROMPTS must describe the EXACT pose, clothing, expression, and position in THIS image — NOT a generic character description. "A girl sitting cross-legged facing right, wearing a puffy dress with a bow on the back, hair in two pigtails with ribbons, smiling with eyes closed, chibi proportions with oversized head" is GOOD. "A cute little girl" is BAD.
2. LOCATION PROMPTS must describe the EXACT spatial layout — what is on the left, center, right, foreground, background. NOT a generic place description.
3. COMPOSITION must specify where each character and prop is positioned relative to the frame.
4. If there are no characters (e.g., pattern/mandala), return empty characters array.
5. If no clear location (white background), return empty locations array.
6. Every detail matters: count the flowers, note the style of the fence, describe the shape of clouds. The more specific, the better the reproduction.`;
