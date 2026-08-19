import type { BookColoringPage } from "./types";

export type { BookColoringPage };

/** The interior "parent number" a new additional page groups under. */
export function additionalParentNumber(
  source: Pick<BookColoringPage, "origin" | "parentPageNumber" | "sourcePageNumber">,
  sourceIndex: number,
): number {
  if (source.origin === "additional" && source.parentPageNumber != null) return source.parentPageNumber;
  if (source.sourcePageNumber != null) return source.sourcePageNumber;
  return sourceIndex + 1;
}

/** Build one additional interior page from a generated image. */
export function buildAdditionalPage(params: {
  id: string;
  url: string;
  parentPageNumber: number;
  prompt?: string;
  coloredUrl?: string;
}): BookColoringPage {
  const { id, url, parentPageNumber, prompt, coloredUrl } = params;
  return {
    id,
    url,
    isPublic: false,
    origin: "additional",
    parentPageNumber,
    ...(prompt ? { prompt } : {}),
    ...(coloredUrl ? { coloredUrl } : {}),
  };
}

/**
 * Migrate one page's regen variants to additional pages (one-time backfill).
 * - Reverts the page's url/coloredUrl to its "original" variant (so a page whose
 *   live image was a regen variant goes back to its original line-art).
 * - Converts each "regen" variant to an additional page under this page's number.
 * - Strips variants + selectedVariantId.
 * A page with no variants is returned unchanged (same reference).
 */
export function planVariantMigration(
  page: BookColoringPage,
  sourceIndex: number,
  newId: () => string,
): { page: BookColoringPage; additional: BookColoringPage[] } {
  const variants = page.variants ?? [];
  if (variants.length === 0) return { page, additional: [] };

  const parentPageNumber = additionalParentNumber(page, sourceIndex);
  const original = variants.find((v) => v.origin === "original");
  const regens = variants.filter((v) => v.origin === "regen");

  const restored: BookColoringPage = { ...page };
  delete restored.variants;
  delete restored.selectedVariantId;
  if (original) {
    restored.url = original.url;
    if (original.coloredUrl) restored.coloredUrl = original.coloredUrl;
    else delete restored.coloredUrl;
  }

  const additional = regens.map((v) =>
    buildAdditionalPage({
      id: newId(),
      url: v.url,
      parentPageNumber,
      ...(v.coloredUrl ? { coloredUrl: v.coloredUrl } : {}),
      ...(v.prompt ? { prompt: v.prompt } : {}),
    }),
  );
  return { page: restored, additional };
}
