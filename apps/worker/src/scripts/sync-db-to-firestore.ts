/**
 * Reverse sync: local Prisma DB (dev.db) → Firestore (prod: iroly-production).
 *
 * WRITES TO PROD. Dry-run by default — pass --commit to actually write.
 *
 * Reconstructs the ORIGINAL Firestore document shape (inverse of the forward
 * mapper) so existing structure is preserved:
 *   - native columns (scalars/json) + data-overflow flattened back to top level
 *   - Prisma-only columns (interiorPages, id) are NOT written
 *   - renames reversed (avatarUrl→photoUrl, name→displayName, description→reason)
 *   - createdAt written in the collection's native format (iso | Timestamp)
 *   - updatedAt set to serverTimestamp()
 *   - ownedBooks/savedBooks split back into user-libraries / user-saved-books
 *
 * Usage (from apps/worker):
 *   # dry-run everything
 *   DATABASE_URL="file:/abs/dev.db" node --import tsx src/scripts/sync-db-to-firestore.ts
 *   # write only new books + characters, don't touch existing docs
 *   ... sync-db-to-firestore.ts --commit --only-new --collections=books,characters
 *
 * Flags:
 *   --commit               actually write (default: dry-run)
 *   --collections=a,b,c    limit to these collections (default: all)
 *   --only-new             skip docs that already exist in Firestore
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "@vx/db";
import {
  CONFIGS,
  toFirestoreDoc,
  reviveMap,
  type AnyRec,
  type SyncConfig,
} from "./firestore-sync-config";

const scriptDir = dirname(fileURLToPath(import.meta.url));

// --- args ------------------------------------------------------------------
const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const ONLY_NEW = args.includes("--only-new");
const collArg = args.find((a) => a.startsWith("--collections="));
const ONLY: Set<string> | null = collArg
  ? new Set(collArg.split("=")[1].split(",").map((s) => s.trim()).filter(Boolean))
  : null;
const wants = (name: string) => !ONLY || ONLY.has(name);

let db: FirebaseFirestore.Firestore;
const stats: Record<string, { written: number; skipped: number }> = {};

async function put(collection: string, id: string, doc: AnyRec): Promise<void> {
  const s = (stats[collection] ??= { written: 0, skipped: 0 });
  const ref = db.collection(collection).doc(id);
  if (ONLY_NEW) {
    const snap = await ref.get();
    if (snap.exists) {
      s.skipped++;
      return;
    }
  }
  if (COMMIT) {
    await ref.set(doc);
  } else if (s.written < 1) {
    // dry-run: show one sample doc per collection
    console.log(`  [dry] ${collection}/${id} =`, JSON.stringify(doc, tsReplacer).slice(0, 240));
  }
  s.written++;
}

/** Show Timestamps readably in dry-run output. */
function tsReplacer(_k: string, v: unknown): unknown {
  if (v instanceof Timestamp) return `<Timestamp ${v.toDate().toISOString()}>`;
  if (v && typeof v === "object" && (v as AnyRec)._methodName) return "<serverTimestamp>";
  return v;
}

// --- generic model → firestore doc ----------------------------------------
// toFirestoreDoc / reviveMap now come from @vx/server-core/firestore (shared
// with the admin "sync one book" route) — imported via ./firestore-sync-config.

async function reverseCollection(cfg: SyncConfig): Promise<void> {
  if (!wants(cfg.collection)) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: AnyRec[] = await (prisma as any)[cfg.model].findMany();
  for (const row of rows) await put(cfg.collection, row.id as string, toFirestoreDoc(cfg, row));
}

async function reverseApp(): Promise<void> {
  if (!wants("app")) return;
  const rows = await prisma.app.findMany();
  for (const row of rows) await put("app", row.id, (row.data as AnyRec | null) ?? {});
}

async function reverseUserAggregates(): Promise<void> {
  const doLib = wants("user-libraries");
  const doSaved = wants("user-saved-books");
  if (!doLib && !doSaved) return;
  const users = await prisma.user.findMany();
  for (const u of users) {
    const data = (u.data as AnyRec | null) ?? {};
    const owned = data.ownedBooks as AnyRec | undefined;
    if (doLib && owned && Object.keys(owned).length) {
      await put("user-libraries", u.id, {
        ownedBooks: reviveMap(owned, "unlockedAt"),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    const saved = data.savedBooks as AnyRec | undefined;
    if (doSaved && saved && Object.keys(saved).length) {
      await put("user-saved-books", u.id, {
        books: reviveMap(saved, "savedAt"),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
}

async function main() {
  const sa = JSON.parse(readFileSync(resolve(scriptDir, "../../service-account.json"), "utf-8"));
  if (getApps().length === 0) initializeApp({ credential: cert(sa), projectId: sa.project_id });
  db = getFirestore();

  console.log(
    `\n${COMMIT ? "🔴 COMMIT" : "🟡 DRY-RUN"} — dev.db → Firestore [${sa.project_id}]` +
      `${ONLY ? `  collections=${[...ONLY].join(",")}` : ""}${ONLY_NEW ? "  only-new" : ""}\n`,
  );
  if (COMMIT) console.log("⚠️  Writing to PRODUCTION Firestore.\n");

  for (const cfg of CONFIGS) await reverseCollection(cfg);
  await reverseApp();
  await reverseUserAggregates();

  console.log("\n=== summary ===");
  for (const [col, s] of Object.entries(stats)) {
    console.log(`  ${col.padEnd(18)} written=${s.written}  skipped(existing)=${s.skipped}`);
  }
  console.log(COMMIT ? "\n✅ Committed to Firestore." : "\n🟡 Dry-run only. Re-run with --commit to write.");
}

main()
  .catch((e) => { console.error("FAIL:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
