/**
 * Build a SUGGESTED Firestore `app/home` document from local book/category rows
 * — this is the "Auto config" heuristic (no per-book tags): newest books →
 * new arrivals, most-pages books → trending, one interior page per book → free.
 * The output shape matches the prod schema exactly (see reference
 * firestore-data-schema.md §5) so it can be stored + pushed without breaking the
 * mobile app. The admin Home screen may then hand-edit the lists.
 *
 *   app/home = {
 *     newArrivalBooks: AppHomeNewArrivalBook[]   // required
 *     trendingBooks:   AppHomeTrendingBook[]      // required
 *     categories:      AppHomeCategory[]          // required
 *     freeColoringPages?: AppHomeFreeColoringPage[] // additive (local extension)
 *     updatedAt: Timestamp                        // set by the writer
 *   }
 *
 * Pure + dependency-free (no Prisma/Firestore imports) so it is trivially
 * testable and reusable by both the admin route and the worker CLI.
 */

export interface AppHomeNewArrivalBook {
  id: string;
  title: string;
  coverUrl: string;
  price?: string;
  subtitle?: string;
  order?: number;
  // The app (iroly-app appCollectionType.ts) tints the new-arrival card with
  // this; without it the card falls back to a flat "$color3" grey. This is the
  // ONLY extra field the app's Zod schema reads here — do not add others (Zod
  // strips unknown keys, so they would just bloat the doc).
  backgroundColor?: string;
}

export interface AppHomeTrendingBook {
  id: string;
  rank: number;
  title: string;
  subtitle: string;
  imageUrl: string;
  participantCount?: string;
}

export interface AppHomeCategory {
  id: string;
  name: string;
  displayName: string;
  description: string;
  iconUrl: string;
  isPublic: boolean;
  order: number;
}

export interface AppHomeFreeColoringPage {
  id: string;
  bookId: string;
  bookTitle: string;
  series: string;
  imageUrl: string;
  backgroundColor: string;
}

export interface AppHomeDoc {
  newArrivalBooks: AppHomeNewArrivalBook[];
  trendingBooks: AppHomeTrendingBook[];
  categories: AppHomeCategory[];
  freeColoringPages: AppHomeFreeColoringPage[];
}

export interface HomeBookInput {
  id: string;
  title?: string | null;
  subtitle?: string | null;
  coverUrl?: string | null;
  price?: string | null;
  backgroundColor?: string | null;
  category?: string | null;
  coloringPages?: unknown;
  createdAt?: Date | string | number | null;
}

export interface HomeCategoryInput {
  id: string;
  name?: string | null;
  displayName?: string | null;
  description?: string | null;
  iconUrl?: string | null;
  isPublic?: boolean | null;
  index?: number | null;
}

/** Tunable sizes for the auto-config heuristic. */
export interface AppHomeLimits {
  newArrivals?: number; // default 10
  trending?: number; // default 10
  freePages?: number; // default 30 (min free coloring pages to fill)
}

const s = (v: unknown): string => (typeof v === "string" ? v : "");
const time = (v: Date | string | number | null | undefined): number => {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") { const t = Date.parse(v); return Number.isNaN(t) ? 0 : t; }
  return 0;
};
const pages = (b: HomeBookInput): Record<string, unknown>[] =>
  Array.isArray(b.coloringPages) ? (b.coloringPages as Record<string, unknown>[]) : [];

/**
 * Heuristic auto-config: derive all four lists from the book/category rows.
 * (The admin Home screen stores hand-curated lists directly; this only powers
 * the "Auto config" button so a fresh store gets a sensible starting point.)
 */
export function buildAppHomeDoc(input: {
  books: HomeBookInput[];
  categories: HomeCategoryInput[];
  resolveUrl: (u?: string | null) => string;
  limits?: AppHomeLimits;
}): AppHomeDoc {
  const { books, categories, resolveUrl, limits } = input;
  const nArrivals = limits?.newArrivals ?? 10;
  const nTrending = limits?.trending ?? 10;
  const nFree = limits?.freePages ?? 30;

  const withCover = books.filter((b) => b.coverUrl);

  const newArrivalBooks: AppHomeNewArrivalBook[] = [...withCover]
    .sort((a, b) => time(b.createdAt) - time(a.createdAt))
    .slice(0, nArrivals)
    .map((b, i) => ({
      id: b.id,
      title: s(b.title),
      coverUrl: resolveUrl(b.coverUrl),
      ...(s(b.price) ? { price: s(b.price) } : {}),
      ...(s(b.subtitle) ? { subtitle: s(b.subtitle) } : {}),
      ...(s(b.backgroundColor) ? { backgroundColor: s(b.backgroundColor) } : {}),
      order: i,
    }));

  const trendingBooks: AppHomeTrendingBook[] = [...withCover]
    .sort((a, b) => pages(b).length - pages(a).length)
    .slice(0, nTrending)
    .map((b, i) => ({
      id: b.id,
      rank: i + 1,
      title: s(b.title),
      subtitle: s(b.subtitle),
      imageUrl: resolveUrl(b.coverUrl),
      participantCount: String(pages(b).length),
    }));

  const homeCategories: AppHomeCategory[] = [...categories]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((c) => ({
      id: c.id,
      name: s(c.name),
      displayName: s(c.displayName) || s(c.name),
      description: s(c.description),
      iconUrl: resolveUrl(c.iconUrl),
      isPublic: c.isPublic ?? true,
      order: c.index ?? 0,
    }));

  // Free pages — fill up to nFree (default 30) by ROUND-ROBIN over the newest
  // books: one page each per round, then a second page each, etc. This reaches
  // the target while keeping variety (spread across books, not all from one).
  const booksNewest = [...withCover].sort((a, c) => time(c.createdAt) - time(a.createdAt));
  // Free pages must be real INTERIOR pages only — never the cover. coloringPages
  // already excludes intro (summaryPages), but coverUrl usually mirrors the first
  // interior page (create-book) or is pinned to one via the page-type picker, so
  // drop any page whose image is the cover. Compare with the cache-buster (?v=)
  // stripped so a busted coverUrl still matches its page.
  const noQuery = (u: string) => u.split("?")[0];
  const bookPages = booksNewest.map((b) => {
    const coverKey = noQuery(s(b.coverUrl));
    return pages(b).filter((p) => {
      const url = s(p.url);
      return url && noQuery(url) !== coverKey;
    });
  });
  const freeColoringPages: AppHomeFreeColoringPage[] = [];
  const maxRounds = Math.max(0, ...bookPages.map((ps) => ps.length));
  for (let round = 0; round < maxRounds && freeColoringPages.length < nFree; round++) {
    for (let i = 0; i < booksNewest.length && freeColoringPages.length < nFree; i++) {
      const b = booksNewest[i];
      const p = bookPages[i][round];
      if (!p) continue;
      freeColoringPages.push({
        id: s(p.id) || `${b.id}-free-${round}`,
        bookId: b.id,
        bookTitle: s(b.title),
        series: s(b.category),
        imageUrl: resolveUrl(s(p.url)),
        backgroundColor: s(b.backgroundColor),
      });
    }
  }

  return { newArrivalBooks, trendingBooks, categories: homeCategories, freeColoringPages };
}
