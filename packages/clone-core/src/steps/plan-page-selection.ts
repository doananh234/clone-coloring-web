/** Interior pages required before a job may enter the paid pipeline. */
export const LANE1_MIN_INTERIOR = 40;

/** Anything carrying the operator's clone-scoped drop mark. */
export interface DroppablePage {
  /** Operator drop mark from the gate. */
  excludedFromClone?: boolean;
  /** Legacy name for the same mark. */
  excluded?: boolean;
}

export interface SelectablePage extends DroppablePage {
  pageNumber: number;
  /** undefined = legacy page, treated as "interior" (matches create-book). */
  pageType?: "cover" | "interiorIntro" | "interior";
}

/**
 * THE canonical drop-flag read. Every consumer that decides whether a page is
 * withheld from the clone must go through this, so `excludedFromClone` and the
 * legacy `excluded` never diverge.
 *
 * Scope: clone-only. A dropped page is not sent to Diaflow and does not enter
 * the clone Book, but it STAYS in `job.pages` and in the exported `Main book/`
 * archive, which must always contain the complete source book.
 */
export const isDroppedFromClone = (p: DroppablePage): boolean =>
  p.excludedFromClone ?? p.excluded ?? false;

export interface PageSelection {
  /** Original page numbers to send to Diaflow, ascending. */
  keptPageNumbers: number[];
  /** Kept pages that count as interior — the value lane routing keys on. */
  interiorCount: number;
  /** 1 = enough interiors to run now. 2 = park, needs page generation first. */
  lane: 1 | 2;
}

const isInterior = (p: SelectablePage): boolean =>
  p.pageType !== "cover" && p.pageType !== "interiorIntro";

/**
 * Turn the operator's gate decisions into the routing outcome.
 *
 * Cover and intro pages are KEPT — `stepCreateBook` needs their redesigned
 * versions for `coverUrl` and `summaryPages` — but they do not count toward
 * the interior total that decides the lane. Only pages the operator dropped
 * are withheld from Diaflow.
 *
 * Pure and total: no I/O, no clock, no randomness.
 */
export function planPageSelection(
  pages: SelectablePage[],
  minInterior: number = LANE1_MIN_INTERIOR,
): PageSelection {
  const kept = pages.filter((p) => !isDroppedFromClone(p));
  const keptPageNumbers = kept
    .map((p) => p.pageNumber)
    .sort((a, b) => a - b);
  const interiorCount = kept.filter(isInterior).length;
  return {
    keptPageNumbers,
    interiorCount,
    lane: interiorCount >= minInterior ? 1 : 2,
  };
}
