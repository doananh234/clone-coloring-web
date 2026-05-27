/**
 * Location Extraction Prompt — extracts a location/environment from a coloring book page.
 * Used with editImage() — the source image is the full scene, the AI must remove characters.
 */

export function buildLocationExtractionPrompt(
  locationPrompt: string,
  locationName?: string,
): string {
  const target = locationName || "the background environment";

  return `TASK: Remove ALL characters, people, and animals from this image. Keep ONLY the background environment: "${target}".

DELETE completely:
- ALL characters, people, animals (every living being)
- ALL foreground subjects
Fill the gaps where characters were with the surrounding environment seamlessly.

LOCATION TO KEEP: ${locationPrompt}

AFTER REMOVING CHARACTERS:
- Complete any background areas that were hidden behind characters
- Maintain the scene's perspective, depth, and spatial layout
- Keep all environmental details: architecture, vegetation, furniture, props, sky, ground

OUTPUT:
- Black and white line art, same style as the original
- The environment/scene with NO characters — empty of all living beings
- Preserve line thickness, art style, and composition of the original background`;
}
