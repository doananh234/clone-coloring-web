/**
 * Character Extraction Prompt — draws an isolated character using a scene as reference.
 * The source scene is passed as a reference image (not the edit base).
 * The AI draws a fresh character on white, matching the reference.
 */

export function buildCharacterExtractionPrompt(
  characterPrompt: string,
  characterName?: string,
  characterInfo?: string,
): string {
  const target = characterName || "the main character";
  const info = characterInfo ? ` (${characterInfo})` : "";

  return `Look at the reference image. Find this character: "${target}"${info}.

Draw this character as a STANDALONE full-body reference sheet on a pure white background.

CHARACTER TO DRAW: ${characterPrompt}

REQUIREMENTS:
1. Draw the COMPLETE FULL BODY — head, torso, arms, hands, legs, feet ALL visible
2. Neutral standing pose facing forward (3/4 view acceptable)
3. Centered on canvas, head to toe, no cropping
4. If character was sitting/hidden in the reference, imagine and draw the full standing body
5. Match EXACTLY: the art style, line weight, proportions, clothing, accessories, facial features from the reference
6. Pure white background — NO other characters, NO furniture, NO objects, NO scene elements
7. Black and white line art only — no shading, no color, no gradients
8. Coloring book style — clean outlines suitable for coloring

OUTPUT: Single character on solid white. Nothing else.`;
}
