import type { ClonePageRawData } from "../clone-types";

/**
 * Build a single reproduction prompt from structured rawData.
 * Combines scene, environment, characters, locations, and props
 * into a self-contained prompt for coloring page generation.
 */
export function buildReproductionPrompt(
  rawData: Omit<ClonePageRawData, "reproductionPrompt">,
): string {
  const parts: string[] = [];

  // Scene context
  if (rawData.scene) {
    if (rawData.scene.description) parts.push(rawData.scene.description);
    if (rawData.scene.cameraView) parts.push(`Camera: ${rawData.scene.cameraView} shot`);
    if (rawData.scene.composition) parts.push(`Composition: ${rawData.scene.composition}`);
  }

  // Characters
  for (const char of Array.isArray(rawData.characters) ? rawData.characters : []) {
    parts.push(`Character (${char.role}): ${char.characterPrompt}`);
  }

  // Location
  for (const loc of Array.isArray(rawData.locations) ? rawData.locations : []) {
    parts.push(`Setting: ${loc.locationPrompt}`);
  }

  // Environment
  const env = rawData.environment;
  if (env) {
    parts.push(
      `Environment: ${env.timeOfDay || ""}, ${env.weather || ""}, ${env.season || ""} season, ${env.mood || ""} mood`,
    );
  }

  // Props
  for (const prop of Array.isArray(rawData.props) ? rawData.props : []) {
    parts.push(`Prop: ${prop.name} at ${prop.position} — ${prop.interaction}`);
  }

  // Coloring page directives
  parts.push(
    "Black and white coloring book page, clean outlines, no shading, no color fill, white background",
  );

  return parts.join(". ");
}
