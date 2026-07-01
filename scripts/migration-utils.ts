/**
 * Migration utilities: Firebase Admin init, batch operations, logging.
 */

import {
  App,
  ServiceAccount,
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import {
  Firestore,
  getFirestore,
  WriteBatch,
} from 'firebase-admin/firestore';
import { Auth, getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { join } from 'path';

import { MigrationEnv } from './migration-types';

// ─── Firebase Init ──────────────────────────────────────────────────────

let db: Firestore;
let auth: Auth;

/**
 * Initialize Firebase Admin SDK for the given environment.
 * Reuses existing app if already initialized.
 */
export function initFirebase(env: MigrationEnv): { db: Firestore; auth: Auth } {
  if (db && auth) return { db, auth };

  const existing = getApps();
  let app: App;

  if (existing.length > 0) {
    app = existing[0];
  } else {
    const serviceAccountPath = join(
      process.cwd(),
      env === 'production'
        ? 'service-account.production.json'
        : 'service-account.development.json'
    );

    const serviceAccountData = JSON.parse(
      readFileSync(serviceAccountPath, 'utf8')
    );

    const serviceAccount: ServiceAccount = {
      projectId: serviceAccountData.project_id,
      clientEmail: serviceAccountData.client_email,
      privateKey: serviceAccountData.private_key,
    };

    app = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId as string,
    });

    logger.info(`Firebase initialized for ${env} (project: ${serviceAccount.projectId})`);
  }

  db = getFirestore(app);
  auth = getAuth(app);
  return { db, auth };
}

// ─── Logger ─────────────────────────────────────────────────────────────

let isDryRun = false;

export const logger = {
  setDryRun(val: boolean) {
    isDryRun = val;
  },

  info(msg: string, ...args: any[]) {
    const prefix = isDryRun ? '[DRY-RUN] ' : '';
    console.log(`${prefix}${msg}`, ...args);
  },

  warn(msg: string, ...args: any[]) {
    const prefix = isDryRun ? '[DRY-RUN] ' : '';
    console.warn(`⚠ ${prefix}${msg}`, ...args);
  },

  error(msg: string, ...args: any[]) {
    console.error(`✖ ${msg}`, ...args);
  },

  success(msg: string, ...args: any[]) {
    const prefix = isDryRun ? '[DRY-RUN] ' : '';
    console.log(`✔ ${prefix}${msg}`, ...args);
  },

  section(title: string) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  ${title}`);
    console.log(`${'─'.repeat(60)}`);
  },
};

// ─── Collection Read ────────────────────────────────────────────────────

/**
 * Read an entire Firestore collection. Returns array of docs with id.
 */
export async function readCollection<T>(
  collectionName: string
): Promise<(T & { id: string })[]> {
  const snapshot = await db.collection(collectionName).get();
  logger.info(`Read ${snapshot.size} docs from "${collectionName}"`);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...(doc.data() as T),
  }));
}

// ─── Batch Write ────────────────────────────────────────────────────────

const BATCH_SIZE = 500;

/**
 * Write documents in batches of 500 (Firestore limit).
 * Each item needs an `id` field used as the document ID.
 */
export async function batchWrite<T extends Record<string, any>>(
  collectionName: string,
  docs: (T & { id: string })[],
  batchSize = BATCH_SIZE
): Promise<number> {
  let written = 0;

  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const batch: WriteBatch = db.batch();

    for (const doc of chunk) {
      const { id, ...data } = doc;
      const ref = db.collection(collectionName).doc(id);
      batch.set(ref, data);
    }

    await batch.commit();
    written += chunk.length;
    logger.info(`  Written ${written}/${docs.length} to "${collectionName}"`);
  }

  return written;
}

/**
 * Merge-update documents in batches. Only updates specified fields,
 * preserving all other existing fields in the document.
 */
export async function batchMergeUpdate<T extends Record<string, any>>(
  collectionName: string,
  docs: (T & { id: string })[],
  batchSize = BATCH_SIZE
): Promise<number> {
  let written = 0;

  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const batch: WriteBatch = db.batch();

    for (const doc of chunk) {
      const { id, ...data } = doc;
      const ref = db.collection(collectionName).doc(id);
      batch.set(ref, data, { merge: true });
    }

    await batch.commit();
    written += chunk.length;
    logger.info(`  Merge-updated ${written}/${docs.length} in "${collectionName}"`);
  }

  return written;
}

/**
 * Write a single document to a specific path (e.g., app/home).
 */
export async function writeDocument(
  collectionName: string,
  docId: string,
  data: Record<string, any>
): Promise<void> {
  await db.collection(collectionName).doc(docId).set(data);
  logger.info(`Written doc "${collectionName}/${docId}"`);
}

// ─── Batch Delete ───────────────────────────────────────────────────────

/**
 * Delete all documents in a collection in batches.
 */
export async function batchDeleteCollection(
  collectionName: string,
  batchSize = BATCH_SIZE
): Promise<number> {
  let deleted = 0;
  let hasMore = true;

  while (hasMore) {
    const snapshot = await db.collection(collectionName).limit(batchSize).get();

    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;
    logger.info(`  Deleted ${deleted} docs from "${collectionName}"`);
  }

  return deleted;
}

// ─── Verification ───────────────────────────────────────────────────────

/**
 * Count documents in a collection.
 */
export async function countCollection(collectionName: string): Promise<number> {
  const snapshot = await db.collection(collectionName).get();
  return snapshot.size;
}

/**
 * Read a single document.
 */
export async function readDocument(
  collectionName: string,
  docId: string
): Promise<Record<string, any> | null> {
  const doc = await db.collection(collectionName).doc(docId).get();
  return doc.exists ? (doc.data() as Record<string, any>) : null;
}
