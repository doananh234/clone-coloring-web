export type PageType = "cover" | "interiorIntro" | "interior";

export interface ClassifyPageInput {
  /** 1-based page position in the source book. */
  pageNumber: number;
  /** LLM analyze signal (Diaflow emits `isCover: true` on cover-style pages). */
  isCover?: boolean;
  /** True once an earlier page has already been assigned `cover` this run. */
  coverAlreadyAssigned?: boolean;
}

export interface ClassifyPageResult {
  pageType: PageType;
  excluded: boolean;
}

/**
 * Seed auto-classification for a clone-job page.
 *
 * Auto-classify only decides cover-vs-interior: the LLM's `isCover` is the
 * primary signal, with page 1 as a fallback cover when nothing was flagged.
 * `interiorIntro` has no reliable auto signal, so it is left for the operator
 * to assign at the review gate. `excluded` always defaults false — the gate is
 * where back covers / blanks / junk get toggled out.
 */
export function classifyPage(input: ClassifyPageInput): ClassifyPageResult {
  const isCover =
    input.isCover === true ||
    (input.pageNumber === 1 && !input.coverAlreadyAssigned);
  return { pageType: isCover ? "cover" : "interior", excluded: false };
}
