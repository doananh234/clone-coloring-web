import type { PageVariant } from "./types";
// Re-export so server routes can import the type + helpers from this one pure module
// (packages/coloring/src/data/types.ts is pure interfaces — safe on the server).
export type { PageVariant };

export interface VariantPage {
  url: string;
  coloredUrl?: string;
  prompt?: string;
  variants?: PageVariant[];
  selectedVariantId?: string;
}

/** Seed the current base image as an origin:"original" variant if none exists yet,
 *  selecting it. Returns the (possibly unchanged) page and the original variant id. */
export function ensureOriginalVariant(
  page: VariantPage,
  newId: () => string,
  now: string,
): { page: VariantPage; originalId: string } {
  const existing = (page.variants ?? []).find((v) => v.origin === "original");
  if (existing) return { page, originalId: existing.id };
  const id = newId();
  const original: PageVariant = {
    id,
    url: page.url,
    ...(page.coloredUrl ? { coloredUrl: page.coloredUrl } : {}),
    origin: "original",
    createdAt: now,
  };
  return {
    page: { ...page, variants: [original], selectedVariantId: id },
    originalId: id,
  };
}

/** Append variants without changing the current selection (add-only). */
export function addVariants(page: VariantPage, incoming: PageVariant[]): VariantPage {
  return { ...page, variants: [...(page.variants ?? []), ...incoming] };
}

/** Point selectedVariantId at `variantId` and mirror its url/coloredUrl onto the page. */
export function selectVariant(page: VariantPage, variantId: string): VariantPage {
  const v = (page.variants ?? []).find((x) => x.id === variantId);
  if (!v) throw new Error(`variant ${variantId} not found`);
  return { ...page, selectedVariantId: variantId, url: v.url, coloredUrl: v.coloredUrl };
}

/** Remove a variant. Refuses the selected variant and any origin:"original". */
export function deleteVariant(page: VariantPage, variantId: string): VariantPage {
  if (variantId === page.selectedVariantId) throw new Error("cannot delete the selected variant");
  const v = (page.variants ?? []).find((x) => x.id === variantId);
  if (v?.origin === "original") throw new Error("cannot delete the original variant");
  return { ...page, variants: (page.variants ?? []).filter((x) => x.id !== variantId) };
}

/** Keep the mirror invariant when an external overwrite sets page.url directly:
 *  if a variant is selected, propagate the new url onto that variant too.
 *  No-op for pages without variants/selection (backward-compatible). */
export function mirrorUrlToSelectedVariant<T extends VariantPage>(page: T, url: string): T {
  if (!page.selectedVariantId || !page.variants) return page;
  return {
    ...page,
    variants: page.variants.map((v) => (v.id === page.selectedVariantId ? { ...v, url } : v)),
  };
}
