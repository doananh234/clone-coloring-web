#!/usr/bin/env tsx
/**
 * Firestore Schema Migration: AI-Image → Coloring Books
 *
 * Usage:
 *   tsx scripts/migrate-to-coloring-schema.ts --dry-run [--env=development]
 *   tsx scripts/migrate-to-coloring-schema.ts --migrate [--env=development]
 *   tsx scripts/migrate-to-coloring-schema.ts --cleanup [--env=production]
 */

import {
  MigrationConfig,
  MigrationMode,
  MigrationEnv,
  OldListingDoc,
  OldCategory,
  OLD_COLLECTIONS,
  NEW_COLLECTIONS,
} from './migration-types';
import {
  initFirebase,
  logger,
  readCollection,
  batchWrite,
  batchMergeUpdate,
  writeDocument,
  batchDeleteCollection,
  countCollection,
  readDocument,
} from './migration-utils';
import {
  transformAllListingsToBooks,
  transformAllCategories,
  generateAppHome,
  createUsersFromAuth,
} from './migration-transformers';
import { validateAll } from './migration-validators';

// ─── CLI Parsing ────────────────────────────────────────────────────────

function parseArgs(): MigrationConfig {
  const args = process.argv.slice(2);

  let mode: MigrationMode | undefined;
  let env: MigrationEnv = 'development';

  for (const arg of args) {
    if (arg === '--dry-run') mode = 'dry-run';
    else if (arg === '--migrate') mode = 'migrate';
    else if (arg === '--cleanup') mode = 'cleanup';
    else if (arg.startsWith('--env=')) {
      const val = arg.split('=')[1];
      if (val === 'development' || val === 'production') {
        env = val;
      } else {
        console.error(`Invalid --env value: "${val}". Use development or production.`);
        process.exit(1);
      }
    }
  }

  if (!mode) {
    console.error('Usage: tsx migrate-to-coloring-schema.ts --dry-run|--migrate|--cleanup [--env=dev|prod]');
    process.exit(1);
  }

  return { mode, env };
}

// ─── Migration Flow ─────────────────────────────────────────────────────

async function runMigration(config: MigrationConfig): Promise<void> {
  const isDryRun = config.mode === 'dry-run';
  logger.setDryRun(isDryRun);

  logger.section(`Migration: ${config.mode} (env: ${config.env})`);

  // 1. Init Firebase
  const { db, auth } = initFirebase(config.env);

  // 2. Read old collections
  logger.section('Reading old collections');
  const listings = await readCollection<OldListingDoc>('listings');
  const oldCategories = await readCollection<OldCategory>('categories');
  logger.info(`Found ${listings.length} listings, ${oldCategories.length} categories`);

  // 3. Transform
  logger.section('Transforming data');

  // Listings → Books
  // The listing docs have the listing data nested under `listingData`
  // readCollection returns them with `id` already attached
  const books = transformAllListingsToBooks(
    listings.map(l => ({
      id: l.id,
      listingData: (l as any).listingData || l,
      crawledAt: (l as any).crawledAt,
      createdAt: (l as any).createdAt,
      updatedAt: (l as any).updatedAt,
    }))
  );

  // Categories → Categories (new shape)
  const categories = transformAllCategories(oldCategories, books);

  // Generate app/home
  const appHome = generateAppHome(books, categories);

  // Create users from Firebase Auth
  logger.section('Creating users from Firebase Auth');
  const users = await createUsersFromAuth(auth);

  // 4. Validate
  const validation = validateAll(books, categories, appHome);

  if (!validation.valid) {
    logger.error('Migration aborted due to validation errors.');
    process.exit(1);
  }

  // 5. Summary
  logger.section('Migration Summary');
  logger.info(`Books:      ${books.length}`);
  logger.info(`Categories: ${categories.length}`);
  logger.info(`Users:      ${users.length}`);
  logger.info(`App/Home:   1 document`);
  logger.info(`Warnings:   ${validation.warnings.length}`);

  // 6. Write (skip if dry-run)
  if (isDryRun) {
    logger.success('Dry-run complete. No data written.');
    return;
  }

  // Clear books + users (safe to recreate), but NOT categories
  logger.section('Clearing books and users (preserving categories)');
  const clearedBooks = await batchDeleteCollection(NEW_COLLECTIONS.BOOKS);
  const clearedUsers = await batchDeleteCollection(NEW_COLLECTIONS.USERS);
  logger.info(`Cleared: ${clearedBooks} books, ${clearedUsers} users`);
  logger.info('Categories preserved — only books[] array will be updated');

  logger.section('Writing new collections');

  // Write books
  await batchWrite(NEW_COLLECTIONS.BOOKS, books);
  logger.success(`Written ${books.length} books`);

  // Merge-update categories: only update books[] field, keep all other fields
  const categoryBooksUpdates = categories.map(cat => ({
    id: cat.id,
    books: cat.books,
  }));
  await batchMergeUpdate(NEW_COLLECTIONS.CATEGORIES, categoryBooksUpdates);
  logger.success(`Updated books[] on ${categories.length} categories (other fields preserved)`);

  // Write app/home
  await writeDocument(NEW_COLLECTIONS.APP, 'home', appHome);
  logger.success('Written app/home');

  // Write users
  if (users.length > 0) {
    await batchWrite(NEW_COLLECTIONS.USERS, users);
    logger.success(`Written ${users.length} users`);
  }

  // 7. Verify
  logger.section('Verification');
  const booksCount = await countCollection(NEW_COLLECTIONS.BOOKS);
  const catsCount = await countCollection(NEW_COLLECTIONS.CATEGORIES);
  const usersCount = await countCollection(NEW_COLLECTIONS.USERS);
  const homeDoc = await readDocument(NEW_COLLECTIONS.APP, 'home');

  logger.info(`Verified: ${booksCount} books, ${catsCount} categories, ${usersCount} users`);
  logger.info(`app/home exists: ${homeDoc !== null}`);

  if (booksCount !== books.length) {
    logger.error(`Book count mismatch: expected ${books.length}, got ${booksCount}`);
  }
  if (catsCount !== categories.length) {
    logger.error(`Category count mismatch: expected ${categories.length}, got ${catsCount}`);
  }

  logger.success('Migration complete!');
}

// ─── Cleanup Flow ───────────────────────────────────────────────────────

async function runCleanup(config: MigrationConfig): Promise<void> {
  logger.section(`Cleanup: deleting old collections (env: ${config.env})`);

  initFirebase(config.env);

  for (const collection of OLD_COLLECTIONS) {
    const count = await countCollection(collection);
    if (count > 0) {
      logger.info(`Deleting "${collection}" (${count} docs)...`);
      const deleted = await batchDeleteCollection(collection);
      logger.success(`Deleted ${deleted} docs from "${collection}"`);
    } else {
      logger.info(`"${collection}" already empty, skipping`);
    }
  }

  // Verify all old collections are empty
  logger.section('Cleanup Verification');
  for (const collection of OLD_COLLECTIONS) {
    const remaining = await countCollection(collection);
    if (remaining > 0) {
      logger.error(`"${collection}" still has ${remaining} docs!`);
    } else {
      logger.success(`"${collection}" is empty`);
    }
  }

  logger.success('Cleanup complete!');
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = parseArgs();

  try {
    if (config.mode === 'cleanup') {
      await runCleanup(config);
    } else {
      await runMigration(config);
    }
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

main();
