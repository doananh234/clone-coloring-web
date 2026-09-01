/**
 * Sync Firestore (prod: iroly-production) → local Prisma DB (dev.db).
 *
 * Read-only on Firestore. Idempotent upsert by document id, so it can be re-run.
 * Mapping/coercion live in ./firestore-sync-config.ts (shared with the reverse
 * script). Strategy per collection:
 *   - known Prisma columns → mapped directly (with optional rename)
 *   - Json columns         → stored as-is (nested Timestamps → ISO strings)
 *   - createdAt            → preserved (Timestamp | ISO string → Date)
 *   - updatedAt            → skipped (Prisma @updatedAt sets it on write)
 *   - every other field    → folded into the model's `data` Json blob
 *
 * user-libraries / user-saved-books → merged into User.data.ownedBooks /
 * User.data.savedBooks keyed by uid (no dedicated Prisma model).
 *
 * Usage (from apps/worker):
 *   DATABASE_URL="file:/abs/path/dev.db" \
 *   node --import tsx src/scripts/sync-firestore-to-db.ts
 *
 * Requires apps/worker/service-account.json (gitignored).
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "@vx/db";
import {
  CONFIGS, ALWAYS_IGNORE, jsonSafe, toDate,
  type AnyRec, type SyncConfig,
} from "./firestore-sync-config";

const scriptDir = dirname(fileURLToPath(import.meta.url));

async function syncCollection(db: FirebaseFirestore.Firestore, cfg: SyncConfig): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any)[cfg.model];
  const snap = await db.collection(cfg.collection).get();
  let n = 0;

  for (const docSnap of snap.docs) {
    const doc = docSnap.data() as AnyRec;
    const known = new Set<string>([
      ...cfg.scalars,
      ...cfg.json,
      ...Object.keys(cfg.rename ?? {}),
      "createdAt",
      ...ALWAYS_IGNORE,
    ]);

    const record: AnyRec = { id: docSnap.id };
    for (const col of cfg.scalars) if (doc[col] !== undefined) record[col] = doc[col];
    for (const col of cfg.json) if (doc[col] !== undefined) record[col] = jsonSafe(doc[col]);
    for (const [from, to] of Object.entries(cfg.rename ?? {})) {
      if (doc[from] !== undefined) record[to] = doc[from];
    }
    const created = toDate(doc.createdAt);
    if (created) record.createdAt = created;

    const overflow: AnyRec = {};
    for (const [k, v] of Object.entries(doc)) if (!known.has(k)) overflow[k] = jsonSafe(v);
    record.data = overflow;

    if (cfg.compute) Object.assign(record, cfg.compute(doc));

    const { id, ...rest } = record;
    await delegate.upsert({ where: { id }, create: record, update: rest });
    n++;
  }
  console.log(`  ${cfg.collection.padEnd(16)} → ${cfg.model.padEnd(14)} : ${n}`);
  return n;
}

async function syncApp(db: FirebaseFirestore.Firestore): Promise<number> {
  const snap = await db.collection("app").get();
  let n = 0;
  for (const d of snap.docs) {
    const data = jsonSafe(d.data()) as AnyRec;
    await prisma.app.upsert({
      where: { id: d.id },
      create: { id: d.id, data: data as never },
      update: { data: data as never },
    });
    n++;
  }
  console.log(`  app              → App            : ${n}`);
  return n;
}

async function mergeIntoUserData(
  db: FirebaseFirestore.Firestore,
  collection: string,
  sourceField: string,
  targetKey: "ownedBooks" | "savedBooks",
): Promise<number> {
  const snap = await db.collection(collection).get();
  let n = 0;
  for (const d of snap.docs) {
    const uid = d.id;
    const value = jsonSafe((d.data() as AnyRec)[sourceField] ?? {});
    const existing = await prisma.user.findUnique({ where: { id: uid } });
    const prev = (existing?.data as AnyRec | null) ?? {};
    const data = { ...prev, [targetKey]: value };
    await prisma.user.upsert({
      where: { id: uid },
      create: { id: uid, data: data as never },
      update: { data: data as never },
    });
    n++;
  }
  console.log(`  ${collection.padEnd(16)} → User.data.${targetKey.padEnd(10)}: ${n}`);
  return n;
}

async function main() {
  const sa = JSON.parse(readFileSync(resolve(scriptDir, "../../service-account.json"), "utf-8"));
  if (getApps().length === 0) initializeApp({ credential: cert(sa), projectId: sa.project_id });
  const db = getFirestore();

  console.log(`Syncing Firestore [${sa.project_id}] → ${process.env.DATABASE_URL}\n`);
  for (const cfg of CONFIGS) await syncCollection(db, cfg);
  await syncApp(db);
  await mergeIntoUserData(db, "user-libraries", "ownedBooks", "ownedBooks");
  await mergeIntoUserData(db, "user-saved-books", "books", "savedBooks");
  console.log("\n✅ Sync complete.");
}

main()
  .catch((e) => { console.error("FAIL:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
