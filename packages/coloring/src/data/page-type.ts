import type { BookColoringPage } from "./types";

/**
 * A book page's "type" as shown in the book-detail classify select. Unlike a
 * clone job (single `pages` array with a `pageType` field), a book stores its
 * pages split across two arrays — intro → `summaryPages`, interior →
 * `coloringPages` — and the cover is a standalone `coverUrl`, not a page object.
 * These helpers let the UI re-classify a page after the book is created (e.g.
 * fix a page mistakenly put in intro), which create-book's one-way split didn't
 * allow.
 */
export type BookPageType = "cover" | "intro" | "interior";

export interface BookPagesState {
  coverUrl: string;
  summaryPages: BookColoringPage[];
  coloringPages: BookColoringPage[];
}

/** Find a page by id across intro (summary) + interior (coloring). */
export function findBookPage(state: BookPagesState, pageId: string): BookColoringPage | undefined {
  return (
    state.summaryPages.find((p) => p.id === pageId) ??
    state.coloringPages.find((p) => p.id === pageId)
  );
}

/**
 * Current type of a page as shown in the UI. Cover wins: a page whose image is
 * the book cover shows as "cover" even while it still lives in an intro/interior
 * array (the book cover is a URL, not a distinct page object).
 */
export function derivePageType(state: BookPagesState, page: BookColoringPage): BookPageType {
  if (state.coverUrl && page.url === state.coverUrl) return "cover";
  if (state.summaryPages.some((p) => p.id === page.id)) return "intro";
  return "interior";
}

/**
 * Immutably re-assign a page's type. Returns a NEW state (never mutates input).
 * - "intro" / "interior": move the page object into the matching array (removing
 *   it from the other), appended at the end — interior order is edited separately
 *   via the reorder flow.
 * - "cover": point `coverUrl` at the page's image; array membership is untouched
 *   (cover is single-valued via `coverUrl`, so selecting cover on another page
 *   moves the designation).
 * Unknown page id → state returned unchanged (same reference).
 */
export function applyPageType(
  state: BookPagesState,
  pageId: string,
  type: BookPageType,
): BookPagesState {
  const page = findBookPage(state, pageId);
  if (!page) return state;

  if (type === "cover") {
    return { ...state, coverUrl: page.url };
  }

  const summaryPages = state.summaryPages.filter((p) => p.id !== pageId);
  const coloringPages = state.coloringPages.filter((p) => p.id !== pageId);
  if (type === "intro") {
    return { ...state, summaryPages: [...summaryPages, page], coloringPages };
  }
  return { ...state, summaryPages, coloringPages: [...coloringPages, page] };
}
