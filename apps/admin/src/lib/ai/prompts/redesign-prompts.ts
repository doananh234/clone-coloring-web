/**
 * Redesign Prompts — strength prefix builders for image-to-image redesign/reproduce.
 */

export function buildRedesignStrengthPrefix(changePercent: number): string {
  const pct = changePercent || 30;
  return `Modify this image by approximately ${pct}%. Keep ${100 - pct}% of the original unchanged.`;
}

export const REPRODUCE_STRENGTH_PREFIX =
  "Modify this image by approximately 30%. Keep 70% of the original unchanged.\n\n";
