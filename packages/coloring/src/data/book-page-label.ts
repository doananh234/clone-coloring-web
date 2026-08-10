export interface BookPageMetaInput {
  sourcePageNumber?: number;
  origin?: "original" | "additional";
  parentPageNumber?: number;
}

export interface BookPageLabel {
  displayNumber: string;
  isAdditional: boolean;
}

/** Visual tone for a page, driven by its section + (for interior) its origin. */
export type BookPageTone = "cover" | "intro" | "interior" | "additional";

/**
 * Display label for a book page. `index` is the page's position in `interior`
 * (the caller maps `interior.map((p, i) => deriveBookPageLabel(p, i, interior))`),
 * used both for the A<n> rank and the pre-D4a positional fallback.
 */
export function deriveBookPageLabel(
  page: BookPageMetaInput,
  index: number,
  interior: BookPageMetaInput[],
): BookPageLabel {
  if (page.origin === "additional" && page.parentPageNumber != null) {
    const parent = page.parentPageNumber;
    let rank = 0;
    for (let i = 0; i <= index; i++) {
      const q = interior[i];
      if (q && q.origin === "additional" && q.parentPageNumber === parent) rank++;
    }
    return { displayNumber: `#${parent}·A${rank}`, isAdditional: true };
  }
  if (page.sourcePageNumber != null) {
    return { displayNumber: `#${page.sourcePageNumber}`, isAdditional: false };
  }
  return { displayNumber: `#${index + 1}`, isAdditional: false };
}

/** Interior additional pages get the "additional" tone; everything else follows its section. */
export function bookPageTone(
  section: "cover" | "intro" | "interior",
  page: BookPageMetaInput,
): BookPageTone {
  if (section === "interior" && page.origin === "additional") return "additional";
  return section;
}
