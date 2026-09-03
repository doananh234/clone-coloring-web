/**
 * TARGETED, SAFE recovery: restore lost `books` from Firestore (prod) into the
 * local Prisma DB — WITHOUT the data-clobbering of the blanket sync script.
 *
 * Read-only on Firestore. Per book:
 *   - MISSING locally            → create full record; data.queueStatus = "todo"
 *                                  (lands in the "Chờ làm" kanban column).
 *   - PARTIAL (local thinner)    → refresh CONTENT columns only (scalars + json
 *                                  + interiorPages). `data` is LEFT UNTOUCHED so
 *                                  local queueStatus / local-only keys survive.
 *   - already complete / same    → skipped.
 *   - local-only (not in FS)     → never touched.
 *
 * Nothing is deleted. Idempotent (re-run safe: once restored, books are "same").
 *
 * Usage (from apps/worker):
 *   DATABASE_URL="file:/abs/dev.db" node --import tsx src/scripts/restore-books-from-firestore.ts
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "@vx/db";
import { CONFIGS, ALWAYS_IGNORE, jsonSafe, toDate, type AnyRec } from "./firestore-sync-config";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const RESTORE_QUEUE_STATUS = "todo";

const bookCfg = CONFIGS.find((c) => c.collection === "books");
if (!bookCfg) throw new Error("books sync config missing");

function len(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

/** Map a Firestore book doc → { content, dataOverflow } using the shared config. */
function mapBook(doc: AnyRec, id: string): { content: AnyRec; dataOverflow: AnyRec; createdAt?: Date } {
  const cfg = bookCfg!;
  const known = new Set<string>([
    ...cfg.scalars,
    ...cfg.json,
    ...Object.keys(cfg.rename ?? {}),
    "createdAt",
    ...ALWAYS_IGNORE,
  ]);
  const content: AnyRec = {};
  for (const col of cfg.scalars) if (doc[col] !== undefined) content[col] = doc[col];
  for (const col of cfg.json) if (doc[col] !== undefined) content[col] = jsonSafe(doc[col]);
  for (const [from, to] of Object.entries(cfg.rename ?? {})) {
    if (doc[from] !== undefined) content[to] = doc[from];
  }
  if (cfg.compute) Object.assign(content, cfg.compute(doc));

  const dataOverflow: AnyRec = {};
  for (const [k, v] of Object.entries(doc)) if (!known.has(k)) dataOverflow[k] = jsonSafe(v);

  return { content, dataOverflow, createdAt: toDate(doc.createdAt) };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const sa = JSON.parse(readFileSync(resolve(scriptDir, "../../service-account.json"), "utf-8"));
  if (getApps().length === 0) initializeApp({ credential: cert(sa), projectId: sa.project_id });
  const db = getFirestore();

  console.log(`Firestore project : ${sa.project_id}`);
  console.log(`Local DB          : ${process.env.DATABASE_URL}`);
  console.log(`Mode              : ${dryRun ? "DRY-RUN (no writes)" : "WRITE"}\n`);

  const snap = await db.collection("books").get();
  const localBooks = await prisma.book.findMany({
    select: { id: true, coverUrl: true, coloringPages: true },
  });
  const local = new Map(localBooks.map((b) => [b.id, { pages: len(b.coloringPages), hasCover: Boolean(b.coverUrl) }]));

  let restored = 0;
  let refreshed = 0;
  let skipped = 0;

  for (const docSnap of snap.docs) {
    const id = docSnap.id;
    const doc = docSnap.data() as AnyRec;
    const { content, dataOverflow, createdAt } = mapBook(doc, id);
    const fsPages = len(doc.coloringPages);
    const fsCover = Boolean(doc.coverUrl);
    const l = local.get(id);

    if (!l) {
      // MISSING → full restore.
      const createRecord: AnyRec = {
        id,
        ...content,
        data: { ...dataOverflow, queueStatus: RESTORE_QUEUE_STATUS },
      };
      if (createdAt) createRecord.createdAt = createdAt;
      if (!createRecord.title) createRecord.title = "(untitled)";
      console.log(`  RESTORE  ${id}  pages=${String(fsPages).padStart(3)}  ${String(doc.title ?? "").slice(0, 45)}`);
      if (!dryRun) await prisma.book.create({ data: createRecord as never });
      restored++;
    } else if (fsPages > l.pages || (fsCover && !l.hasCover)) {
      // PARTIAL → refresh CONTENT only; never touch `data` (preserves queueStatus).
      const { id: _omit, ...updateContent } = { id, ...content };
      console.log(`  REFRESH  ${id}  local=${String(l.pages).padStart(3)}→fs=${String(fsPages).padStart(3)}  ${String(doc.title ?? "").slice(0, 40)}`);
      if (!dryRun) await prisma.book.update({ where: { id }, data: updateContent as never });
      refreshed++;
    } else {
      skipped++;
    }
  }

  console.log(`\n${dryRun ? "[DRY-RUN] " : ""}Done. restored=${restored} refreshed=${refreshed} skipped=${skipped}`);
}

main()
  .catch((e) => { console.error("FAIL:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
