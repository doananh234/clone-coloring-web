/**
 * Pure helper for deleting ONE color variant from a ColoringStyle's `variants[]`.
 *
 * A variant is an element of the `variants` Json array (see coloring-style-variant.ts) —
 * NOT its own row. The style's top-level `colorPalette`/`thumbnailUrl`/
 * `colorizationDirective` MIRROR variant #1 (index 0), so removing index 0 must
 * re-mirror those fields onto the row from the new first variant. Removing any
 * other index leaves the mirror untouched.
 *
 * No DB access — the API route applies the returned values.
 */

import { readVariants, type ColoringStyleVariant, type ColorPalette } from "./coloring-style-variant";

/** Top-level fields that mirror variant #1 — rewritten only when index 0 changes. */
export interface VariantMirror {
  colorPalette: ColorPalette;
  thumbnailUrl: string;
  colorizationDirective: string;
}

export interface RemoveVariantResult {
  /** The variants array after removal (unchanged when nothing was removed). */
  variants: ColoringStyleVariant[];
  /** true when a matching variant existed and was removed. */
  removed: boolean;
  /** true when `variantId` is the style's ONLY variant — caller must block
   *  (delete the whole style instead of emptying its variants). */
  wasLast: boolean;
  /** New top-level mirror fields — present only when variant #1 (index 0) was
   *  removed and a replacement exists. undefined = leave the row's mirror as-is. */
  topLevel?: VariantMirror;
}

function mirrorOf(v: ColoringStyleVariant): VariantMirror {
  return {
    colorPalette: v.colorPalette ?? {},
    thumbnailUrl: v.thumbnailUrl ?? "",
    colorizationDirective: v.colorizationDirective ?? "",
  };
}

export function removeVariant(rawVariants: unknown, variantId: string): RemoveVariantResult {
  const list = readVariants(rawVariants);
  const idx = list.findIndex((v) => v.id === variantId);

  if (idx < 0) {
    return { variants: list, removed: false, wasLast: false };
  }
  // Removing the only variant would leave a style with zero palettes — block it;
  // the caller should offer deleting the whole style row instead.
  if (list.length === 1) {
    return { variants: list, removed: false, wasLast: true };
  }

  const variants = list.filter((_, i) => i !== idx);
  // Re-mirror only when the removed variant was the mirrored one (index 0).
  const topLevel = idx === 0 ? mirrorOf(variants[0]) : undefined;
  return { variants, removed: true, wasLast: false, topLevel };
}
