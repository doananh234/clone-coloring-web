/**
 * Migration types for Firestore schema migration.
 * Old types (from existing codebase) → New types (from docs/coloring.md).
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// ─── Old Schema Types (from existing codebase) ─────────────────────────

/** Old listing image from Strapi crawler */
export interface OldListingImage {
  url: string;
  thumbnail: string;
  isRedesign?: boolean;
}

/** Old free PDF from listing */
export interface OldFreePdf {
  url: string;
  thumbnail: string;
  mergedUrl?: string;
}

/** Old tag from listing */
export interface OldTag {
  _id: string;
  name: string;
  image?: { url: string; thumbnail: string };
  slug?: Record<string, string>;
  slugId?: string;
  [key: string]: any;
}

/** Old listing data nested inside ListingDoc */
export interface OldListing {
  _id?: string;
  itemName?: string;
  shortName?: string;
  shortDescription?: string;
  description?: string;
  standardPrice?: number;
  isPublic?: boolean;
  isDeleted?: boolean;
  images?: OldListingImage[];
  freePdfs?: OldFreePdf[];
  categories?: string[];
  metaCategories?: string[];
  newTags?: OldTag[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
  [key: string]: any;
}

/** Old Firestore listing document wrapper */
export interface OldListingDoc {
  id: string;
  listingData: OldListing;
  crawledAt: Timestamp | Date;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

/** Old category with styles[] dual-storage */
export interface OldCategoryStyle {
  id: string;
  name: string;
  description: string;
  creditCost: number;
  originalImageUrl?: string;
  generatedImageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OldCategory {
  id: string;
  name: string;
  displayName: string;
  description: string;
  iconPrompt: string;
  thumbnailPrompt: string;
  iconUrl?: string;
  thumbnailUrl?: string;
  index: number;
  styles: OldCategoryStyle[];
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

/** Old wallet document */
export interface OldWalletDoc {
  balance: number;
  lastLedgerId?: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

// ─── New Schema Types (from docs/coloring.md) ──────────────────────────

/** Embedded page in a book */
export interface BookColoringPage {
  id: string;
  url: string;
  isPublic?: boolean;
}

/** Embedded specifications in a book */
export interface BookSpecifications {
  pages: number;
  dimensions?: string;
  ageRange?: string;
}

/** New book document in books/{bookId} */
export interface NewBook {
  title: string;
  subtitle?: string;
  description?: string;
  price?: string;
  originalPrice?: string;
  discount?: string;
  category?: string;
  categoryId?: string;
  badge?: string;
  backgroundColor?: string;
  tryoutPage?: string;
  coverUrl: string;
  summaryPages?: BookColoringPage[];
  coloringPages: BookColoringPage[];
  specifications: BookSpecifications;
  /** True when converted from a listing during migration */
  isConverted?: boolean;
  /** True when source listing had Diaflow/redesign images */
  isRedesigned?: boolean;
  /** True when edition images have been converted to coloring pages */
  isEditionConverted?: boolean;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

/** Embedded book summary inside category.books[] */
export interface BookSummary {
  id: string;
  title: string;
  coverUrl: string;
  price?: string;
  badge?: string;
  order?: number;
}

/** New category document in categories/{categoryId} */
export interface NewCategory {
  name: string;
  displayName: string;
  description: string;
  iconUrl: string;
  iconPrompt: string;
  isPublic?: boolean;
  index?: number;
  books: BookSummary[];
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

/** Embedded new arrival book in app/home */
export interface AppHomeNewArrivalBook {
  id: string;
  title: string;
  coverUrl: string;
  price?: string;
  subtitle?: string;
  order?: number;
}

/** Embedded trending book in app/home */
export interface AppHomeTrendingBook {
  id: string;
  rank: number;
  title: string;
  subtitle: string;
  imageUrl: string;
  participantCount?: string;
}

/** Embedded category in app/home */
export interface AppHomeCategory {
  id: string;
  name: string;
  displayName: string;
  description: string;
  iconUrl: string;
  isPublic: boolean;
  order: number;
}

/** New app/home document */
export interface AppHome {
  newArrivalBooks: AppHomeNewArrivalBook[];
  trendingBooks: AppHomeTrendingBook[];
  categories: AppHomeCategory[];
  updatedAt?: Timestamp | FieldValue;
}

/** New user document in users/{userId} */
export interface NewUser {
  displayName: string | null;
  photoUrl: string | null;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

// ─── Migration Config ───────────────────────────────────────────────────

export type MigrationMode = 'dry-run' | 'migrate' | 'cleanup';
export type MigrationEnv = 'development' | 'production';

export interface MigrationConfig {
  mode: MigrationMode;
  env: MigrationEnv;
}

/** Old collection names to read/delete */
export const OLD_COLLECTIONS = [
  'wallets',
  'credit_ledger',
  'purchases',
  'generated_images',
  'image_feed_meta',
  'image_feed_chunks',
  'styles',
  'listings',
  'images',
  'redeem_histories',
] as const;

/** New collection names */
export const NEW_COLLECTIONS = {
  BOOKS: 'books',
  CATEGORIES: 'categories',
  APP: 'app',
  USERS: 'users',
} as const;
