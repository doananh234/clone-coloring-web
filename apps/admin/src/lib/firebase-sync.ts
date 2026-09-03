/**
 * Dedicated Firebase app for pushing local data UP to the real (prod) Firestore.
 *
 * Kept SEPARATE from `firebase-admin.ts` (which defaults to the development
 * project and is only used for Auth). Syncing a book must target the same prod
 * project the worker reverse-sync script uses — so this resolves a production
 * service account explicitly and initializes a NAMED app to avoid clashing.
 *
 * Service account resolution order:
 *   1. FIREBASE_SYNC_SERVICE_ACCOUNT_JSON  (inline JSON)
 *   2. FIREBASE_SYNC_SERVICE_ACCOUNT_PATH  (explicit file path)
 *   3. service-account.production.json / service-account.json in apps/admin,
 *      repo root, or apps/worker
 */
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";

const APP_NAME = "firestore-sync";

function readSa(raw: string): { sa: ServiceAccount; projectId: string } {
  const parsed = JSON.parse(raw) as Record<string, string>;
  return { sa: parsed as unknown as ServiceAccount, projectId: parsed.project_id };
}

function loadSyncServiceAccount(): { sa: ServiceAccount; projectId: string } {
  const envJson = process.env.FIREBASE_SYNC_SERVICE_ACCOUNT_JSON;
  if (envJson) return readSa(envJson);

  const candidates: string[] = [];
  if (process.env.FIREBASE_SYNC_SERVICE_ACCOUNT_PATH) {
    candidates.push(process.env.FIREBASE_SYNC_SERVICE_ACCOUNT_PATH);
  }
  // Prefer an explicit production SA, then the worker's SA. Search apps/admin
  // (cwd), the repo root, and apps/worker.
  for (const name of ["service-account.production.json", "service-account.json"]) {
    candidates.push(path.resolve(process.cwd(), name));
    candidates.push(path.resolve(process.cwd(), "../..", name));
    candidates.push(path.resolve(process.cwd(), "../worker", name));
  }

  for (const p of candidates) {
    if (p && fs.existsSync(p)) return readSa(fs.readFileSync(p, "utf-8"));
  }

  throw new Error(
    "No Firebase service account for sync. Set FIREBASE_SYNC_SERVICE_ACCOUNT_PATH " +
      "(or FIREBASE_SYNC_SERVICE_ACCOUNT_JSON), or place service-account.production.json " +
      "at the repo root / apps/admin.",
  );
}

/** Lazily init (once) and return the prod Firestore handle + its project id. */
export function getSyncFirestore(): { db: Firestore; projectId: string } {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) {
    return {
      db: getFirestore(existing),
      projectId: (existing.options.projectId as string) ?? "unknown",
    };
  }
  const { sa, projectId } = loadSyncServiceAccount();
  const app = initializeApp({ credential: cert(sa), projectId }, APP_NAME);
  return { db: getFirestore(app), projectId };
}
