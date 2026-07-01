/**
 * Validation helpers for migration data integrity checks.
 * Aborts migration if any validation fails.
 */

import {
  NewBook,
  NewCategory,
  AppHome,
} from './migration-types';
import { logger } from './migration-utils';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Book Validation ────────────────────────────────────────────────────

function validateBook(book: NewBook & { id: string }, index: number): string[] {
  const errors: string[] = [];
  const prefix = `Book[${index}] "${book.id}"`;

  if (!book.title) errors.push(`${prefix}: missing title`);
  if (!book.coverUrl) errors.push(`${prefix}: missing coverUrl`);
  if (!book.coloringPages || book.coloringPages.length === 0) {
    errors.push(`${prefix}: coloringPages is empty`);
  }
  if (!book.specifications || book.specifications.pages <= 0) {
    errors.push(`${prefix}: specifications.pages must be > 0`);
  }

  return errors;
}

// ─── Category Validation ────────────────────────────────────────────────

function validateCategory(
  cat: NewCategory & { id: string },
  index: number
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const prefix = `Category[${index}] "${cat.id}"`;

  if (!cat.name) errors.push(`${prefix}: missing name`);
  if (!cat.displayName) errors.push(`${prefix}: missing displayName`);
  if (!cat.description) errors.push(`${prefix}: missing description`);
  if (!cat.iconUrl) errors.push(`${prefix}: missing iconUrl`);
  if (!cat.iconPrompt) errors.push(`${prefix}: missing iconPrompt`);

  if (!cat.books || cat.books.length === 0) {
    warnings.push(`${prefix}: books[] is empty (category has no books)`);
  }

  return { errors, warnings };
}

// ─── App Home Validation ────────────────────────────────────────────────

function validateAppHome(home: AppHome): string[] {
  const errors: string[] = [];

  if (!home.newArrivalBooks || home.newArrivalBooks.length === 0) {
    errors.push('app/home: newArrivalBooks is empty');
  }
  if (!home.trendingBooks || home.trendingBooks.length === 0) {
    errors.push('app/home: trendingBooks is empty');
  }
  if (!home.categories || home.categories.length === 0) {
    errors.push('app/home: categories is empty');
  }

  return errors;
}

// ─── Referential Integrity ──────────────────────────────────────────────

function validateReferentialIntegrity(
  books: (NewBook & { id: string })[],
  categories: (NewCategory & { id: string })[]
): string[] {
  const warnings: string[] = [];
  const categoryIds = new Set(categories.map(c => c.id));
  const categoryNames = new Set(categories.map(c => c.name));

  for (const book of books) {
    if (book.categoryId && !categoryIds.has(book.categoryId) && !categoryNames.has(book.categoryId)) {
      warnings.push(
        `Book "${book.id}" has categoryId "${book.categoryId}" which doesn't exist in categories`
      );
    }
  }

  return warnings;
}

// ─── Main Validation Entry ──────────────────────────────────────────────

/**
 * Validate all transformed data before writing to Firestore.
 * Returns result with errors (fatal) and warnings (non-fatal).
 */
export function validateAll(
  books: (NewBook & { id: string })[],
  categories: (NewCategory & { id: string })[],
  home: AppHome
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  logger.section('Validation');

  // Validate books
  books.forEach((book, i) => {
    errors.push(...validateBook(book, i));
  });

  // Validate categories
  categories.forEach((cat, i) => {
    const result = validateCategory(cat, i);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  });

  // Validate app/home
  errors.push(...validateAppHome(home));

  // Referential integrity
  warnings.push(...validateReferentialIntegrity(books, categories));

  // Log results
  if (errors.length > 0) {
    logger.error(`Validation FAILED with ${errors.length} error(s):`);
    errors.forEach(e => logger.error(`  - ${e}`));
  }

  if (warnings.length > 0) {
    logger.warn(`Validation warnings (${warnings.length}):`);
    warnings.forEach(w => logger.warn(`  - ${w}`));
  }

  if (errors.length === 0) {
    logger.success('Validation passed');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
