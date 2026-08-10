export type PageType = "cover" | "interiorIntro" | "interior";

export interface ClassifyPageInput {
  /** 1-based page position in the source book. */
  pageNumber: number;
  /** Diaflow analyze signal — cover-style page. */
  isCover?: boolean;
  /** Diaflow analyze signal — title/intro page → interiorIntro. */
  isIntro?: boolean;
  /** Diaflow analyze signal — normal interior page. */
  isInterior?: boolean;
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
 * Diaflow emits three per-page booleans — `isCover` / `isIntro` / `isInterior`
 * — consumed here with precedence cover > intro > interior. When none is set
 * (older flows / uncertain pages), fall back to page 1 = cover (unless a cover
 * was already assigned this run) and everything else = interior.
 *
 * `excluded` always defaults false — Diaflow sends no exclusion signal, so back
 * covers / blanks / junk are toggled out by the operator at the review gate.
 */
export function classifyPage(input: ClassifyPageInput): ClassifyPageResult {
  let pageType: PageType;
  if (input.isCover === true) {
    pageType = "cover";
  } else if (input.isIntro === true) {
    pageType = "interiorIntro";
  } else if (input.isInterior === true) {
    pageType = "interior";
  } else if (input.pageNumber === 1 && !input.coverAlreadyAssigned) {
    pageType = "cover";
  } else {
    pageType = "interior";
  }
  return { pageType, excluded: false };
}
