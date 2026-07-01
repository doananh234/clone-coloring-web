/**
 * Data transformation functions: old schema → new coloring-book schema.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { Auth } from 'firebase-admin/auth';
import { v4 as uuidv4 } from 'uuid';

import {
  OldListingDoc,
  OldCategory,
  NewBook,
  NewCategory,
  BookColoringPage,
  BookSummary,
  AppHome,
  AppHomeNewArrivalBook,
  AppHomeTrendingBook,
  AppHomeCategory,
  NewUser,
} from './migration-types';
import { logger } from './migration-utils';

// ─── Category Mapping ───────────────────────────────────────────────────

/** Known dashboard category names for auto-mapping from tags/title */
const CATEGORY_KEYWORDS: [string[], string][] = [
  [['animal', 'cat ', 'dog ', 'unicorn', 'horse', 'llama', 'bear', 'fox', 'bird', 'dinosaur', 'dragon', 'bunny', 'rabbit', 'puppy', 'kitten', 'owl', 'butterfly', 'ocean', 'sea creature', 'fish', 'dolphin', 'whale', 'turtle'], 'animals'],
  [['bold', 'easy', 'simple', 'large print', 'big print'], 'bold-easy'],
  [['christmas', 'xmas', 'santa', 'reindeer', 'snowman'], 'christmas'],
  [['city', 'cities', 'architecture', 'building', 'town', 'house', 'village'], 'cities'],
  [['color by number', 'number coloring', 'color-by-number'], 'color-by-number'],
  [['fantasy', 'sci-fi', 'scifi', 'wizard', 'fairy', 'magic', 'mythical', 'elf'], 'fantasy-scifi'],
  [['fashion', 'style', 'outfit', 'dress', 'clothing'], 'fashion'],
  [['flower', 'floral', 'botanical', 'garden', 'rose', 'bouquet'], 'flowers'],
  [['fuzzy', 'buddies', 'cute', 'kawaii', 'chibi', 'adorable'], 'fuzzy-buddies'],
  [['holiday', 'seasonal', 'easter', 'valentine', 'thanksgiving', 'halloween'], 'holiday-seasonal'],
  [['humor', 'funny', 'comedy', 'silly', 'weird', 'sarcastic', 'joke'], 'humorous'],
  [['mandala', 'zentangle', 'geometric', 'pattern', 'abstract'], 'mandalas'],
  [['religious', 'christian', 'bible', 'church', 'faith', 'prayer', 'spiritual'], 'religious'],
  [['spooky', 'horror', 'creepy', 'ghost', 'zombie', 'skeleton', 'witch'], 'spooky'],
];

/**
 * Auto-detect category from tags and title.
 * Returns the dashboard category name or undefined.
 */
function detectCategory(tags: string[], title: string): string | undefined {
  const searchText = [...tags, title].join(' ').toLowerCase();

  for (const [keywords, categoryName] of CATEGORY_KEYWORDS) {
    if (keywords.some(kw => searchText.includes(kw))) {
      return categoryName;
    }
  }

  return undefined;
}

// ─── Badge Mapping ──────────────────────────────────────────────────────

const BADGE_KEYWORDS: [string, string][] = [
  ['best', 'bestSeller'],
  ['featured', 'featured'],
  ['editor', 'editorsPick'],
  ['new', 'newArrival'],
  ['recommend', 'recommended'],
];

/**
 * Map old tag slugs to a badge string.
 * First match wins.
 */
function mapTagsToBadge(tags?: { slug?: Record<string, string>; slugId?: string; name?: string }[]): string | undefined {
  if (!tags || tags.length === 0) return undefined;

  for (const tag of tags) {
    const slugValue = tag.slugId || tag.slug?.en || tag.name || '';
    const lower = slugValue.toLowerCase();

    for (const [keyword, badge] of BADGE_KEYWORDS) {
      if (lower.includes(keyword)) return badge;
    }
  }

  return undefined;
}

// ─── Listing → Book ─────────────────────────────────────────────────────

/**
 * Transform a single old ListingDoc into a NewBook.
 * Returns null if the listing is missing required data (coverUrl).
 */
export function transformListingToBook(
  listingDoc: OldListingDoc
): (NewBook & { id: string }) | null {
  const data = listingDoc.listingData;

  // Skip deleted listings
  if (data.isDeleted) {
    logger.warn(`Skipping deleted listing: ${listingDoc.id}`);
    return null;
  }

  // Require at least one image for coverUrl
  if (!data.images || data.images.length === 0) {
    logger.warn(`Skipping listing "${listingDoc.id}" — no images (coverUrl required)`);
    return null;
  }

  const title = data.itemName || 'Untitled Book';
  const coverUrl = data.images[0].url;

  // Build coloring pages from images
  const coloringPages: BookColoringPage[] = data.images.map(img => ({
    id: uuidv4(),
    url: img.url,
    isPublic: data.isPublic ?? false,
  }));

  // Build summary pages from freePdf thumbnails
  const summaryPages: BookColoringPage[] | undefined =
    data.freePdfs && data.freePdfs.length > 0
      ? data.freePdfs
          .filter(pdf => pdf.thumbnail)
          .map(pdf => ({
            id: uuidv4(),
            url: pdf.thumbnail,
          }))
      : undefined;

  const badge = mapTagsToBadge(data.newTags);

  // Resolve timestamps — handle Firestore Timestamp or Date or string
  const resolveTimestamp = (val: any): FieldValue => {
    // Always use serverTimestamp for the migrated doc
    return FieldValue.serverTimestamp();
  };

  // Detect conversion status from listing data
  const hasRedesignImages = data.images?.some(img => img.isRedesign) ?? false;

  const book: NewBook & { id: string } = {
    id: listingDoc.id,
    title,
    subtitle: data.galleries?.[0]?.title || undefined,
    description: data.description || undefined,
    price: data.standardPrice != null ? String(data.standardPrice) : undefined,
    category: detectCategory(
      (data.newTags || []).map((t: any) => t.name || t.slugId || '').filter(Boolean),
      title
    ),
    categoryId: detectCategory(
      (data.newTags || []).map((t: any) => t.name || t.slugId || '').filter(Boolean),
      title
    ),
    badge,
    coverUrl,
    coloringPages,
    summaryPages,
    specifications: {
      pages: coloringPages.length,
    },
    isConverted: true,
    isRedesigned: hasRedesignImages,
    isEditionConverted: false,
    createdAt: resolveTimestamp(listingDoc.createdAt),
    updatedAt: resolveTimestamp(listingDoc.updatedAt),
  };

  // Strip undefined fields to keep Firestore docs clean
  return JSON.parse(JSON.stringify(book)) as NewBook & { id: string };
}

/**
 * Transform all listing docs into books. Skips invalid listings.
 */
export function transformAllListingsToBooks(
  listings: OldListingDoc[]
): (NewBook & { id: string })[] {
  const books: (NewBook & { id: string })[] = [];
  let skipped = 0;

  for (const listing of listings) {
    const book = transformListingToBook(listing);
    if (book) {
      books.push(book);
    } else {
      skipped++;
    }
  }

  logger.info(`Transformed ${books.length} books, skipped ${skipped} listings`);
  return books;
}

// ─── Category → Category ────────────────────────────────────────────────

/**
 * Transform old category to new category shape.
 * Populates books[] from the transformed books that match this category.
 */
export function transformCategory(
  oldCat: OldCategory,
  allBooks: (NewBook & { id: string })[]
): NewCategory & { id: string } {
  // Find books that belong to this category
  const matchingBooks = allBooks.filter(
    book => book.categoryId === oldCat.id || book.categoryId === oldCat.name
  );

  const books: BookSummary[] = matchingBooks.map((book, idx) => ({
    id: book.id,
    title: book.title,
    coverUrl: book.coverUrl,
    price: book.price || '',
    badge: book.badge || '',
    order: idx,
  }));

  return {
    id: oldCat.id,
    name: oldCat.name,
    displayName: oldCat.displayName,
    description: oldCat.description,
    iconUrl: oldCat.iconUrl || '',
    iconPrompt: oldCat.iconPrompt,
    isPublic: true,
    index: oldCat.index,
    books,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/**
 * Transform all old categories.
 */
export function transformAllCategories(
  oldCategories: OldCategory[],
  allBooks: (NewBook & { id: string })[]
): (NewCategory & { id: string })[] {
  const categories = oldCategories.map(cat => transformCategory(cat, allBooks));
  logger.info(`Transformed ${categories.length} categories`);
  return categories;
}

// ─── App Home Generation ────────────────────────────────────────────────

/**
 * Auto-generate app/home document from migrated books and categories.
 */
export function generateAppHome(
  books: (NewBook & { id: string })[],
  categories: (NewCategory & { id: string })[]
): AppHome {
  // New arrivals: top 10 books (server timestamps make sorting unreliable,
  // so we take the last 10 from the array, assuming they were added recently)
  const newArrivalBooks: AppHomeNewArrivalBook[] = books
    .slice(-10)
    .reverse()
    .map((book, idx) => ({
      id: book.id,
      title: book.title,
      coverUrl: book.coverUrl,
      price: book.price || '',
      subtitle: book.subtitle || '',
      order: idx,
    }));

  // Trending: top 10 books by page count (most pages = most content)
  const trendingBooks: AppHomeTrendingBook[] = [...books]
    .sort((a, b) => b.specifications.pages - a.specifications.pages)
    .slice(0, 10)
    .map((book, idx) => ({
      id: book.id,
      rank: idx + 1,
      title: book.title,
      subtitle: book.subtitle || book.description || '',
      imageUrl: book.coverUrl,
    }));

  // Categories strip
  const homeCategories: AppHomeCategory[] = categories.map((cat, idx) => ({
    id: cat.id,
    name: cat.name,
    displayName: cat.displayName,
    description: cat.description,
    iconUrl: cat.iconUrl,
    isPublic: cat.isPublic ?? true,
    order: cat.index ?? idx,
  }));

  logger.info(
    `Generated app/home: ${newArrivalBooks.length} arrivals, ${trendingBooks.length} trending, ${homeCategories.length} categories`
  );

  return {
    newArrivalBooks,
    trendingBooks,
    categories: homeCategories,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

// ─── Users from Firebase Auth ───────────────────────────────────────────

/**
 * Create user documents from all Firebase Auth users.
 */
export async function createUsersFromAuth(
  authInstance: Auth
): Promise<(NewUser & { id: string })[]> {
  const users: (NewUser & { id: string })[] = [];
  let nextPageToken: string | undefined;

  do {
    const result = await authInstance.listUsers(1000, nextPageToken);

    for (const userRecord of result.users) {
      users.push({
        id: userRecord.uid,
        displayName: userRecord.displayName || null,
        photoUrl: userRecord.photoURL || null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    nextPageToken = result.pageToken;
  } while (nextPageToken);

  logger.info(`Created ${users.length} user documents from Firebase Auth`);
  return users;
}
