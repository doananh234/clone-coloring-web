export const DEFAULT_TARGET_INTERIOR = 40;
export const FILL_CHANGE_BASE = 40;
export const FILL_CHANGE_STEP = 10;
export const FILL_CHANGE_CAP = 80;

export interface FillInteriorPage {
  pageNumber: number;
  imageUrl?: string;
  pageType?: "cover" | "interiorIntro" | "interior";
  excluded?: boolean;
  origin?: "original" | "additional";
}

export interface FillTask {
  sourceImageUrl: string;
  parentPageNumber: number;
  pageNumber: number;
  changePercent: number;
}

/** Shared with create-book: legacy (undefined pageType) counts as interior. */
const isInterior = (p: FillInteriorPage): boolean =>
  p.pageType !== "cover" && p.pageType !== "interiorIntro";

/**
 * Decide which source interiors to clone (and at what change-%) to reach `target`
 * total interior pages. Pure + deterministic given `opts.shuffle` (defaults to
 * identity so tests are stable; the worker injects a real shuffle at runtime).
 *
 * - need = max(0, target - existing interior !excluded)
 * - pool = ORIGINAL interior !excluded pages with an imageUrl
 * - pick round-robin: distinct sources until the pool is exhausted, then a new
 *   shuffled pass. Each full pass ("round") bumps change-% by FILL_CHANGE_STEP
 *   (capped) so repeated clones of the same source diverge.
 */
export function planFillInterior(
  pages: FillInteriorPage[],
  target: number,
  opts: { shuffle?: <T>(a: T[]) => T[] } = {},
): FillTask[] {
  const shuffle = opts.shuffle ?? (<T,>(a: T[]) => a);
  const existing = pages.filter((p) => isInterior(p) && !p.excluded).length;
  const need = Math.max(0, target - existing);
  const pool = pages.filter(
    (p) => p.origin !== "additional" && isInterior(p) && !p.excluded && !!p.imageUrl,
  );
  if (need === 0 || pool.length === 0) return [];

  let nextSeq = Math.max(...pages.map((p) => p.pageNumber)) + 1;
  const tasks: FillTask[] = [];
  let made = 0;
  while (made < need) {
    const round = Math.floor(made / pool.length);
    const changePercent = Math.min(
      FILL_CHANGE_CAP,
      FILL_CHANGE_BASE + round * FILL_CHANGE_STEP,
    );
    const ordered = shuffle(pool.slice());
    for (let k = 0; k < ordered.length && made < need; k++) {
      const src = ordered[k];
      tasks.push({
        sourceImageUrl: src.imageUrl as string,
        parentPageNumber: src.pageNumber,
        pageNumber: nextSeq++,
        changePercent,
      });
      made++;
    }
  }
  return tasks;
}
