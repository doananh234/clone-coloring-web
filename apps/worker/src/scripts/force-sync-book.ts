/**
 * FORCE-sync specific book(s) Firestore (prod) → local Prisma DB, overwriting
 * local CONTENT columns with Firestore's version (Firestore is authoritative).
 * `book.data` is LEFT UNTOUCHED (local queueStatus / local-only keys survive).
 * Read-only on Firestore. Pass one or more book ids as args.
 *
 * Usage (from apps/worker):
 *   DATABASE_URL="file:/abs/dev.db" node --import tsx src/scripts/force-sync-book.ts <bookId> [<bookId>...] [--dry-run]
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "@vx/db";
import { CONFIGS, jsonSafe, type AnyRec } from "./firestore-sync-config";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const bookCfg = CONFIGS.find((c) => c.collection === "books");
if (!bookCfg) throw new Error("books sync config missing");

const len = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

/** Firestore book doc → content columns only (scalars + json + rename + compute). */
function mapContent(doc: AnyRec): AnyRec {
  const cfg = bookCfg!;
  const content: AnyRec = {};
  for (const col of cfg.scalars) if (doc[col] !== undefined) content[col] = doc[col];
  for (const col of cfg.json) if (doc[col] !== undefined) content[col] = jsonSafe(doc[col]);
  for (const [from, to] of Object.entries(cfg.rename ?? {})) {
    if (doc[from] !== undefined) content[to] = doc[from];
  }
  if (cfg.compute) Object.assign(content, cfg.compute(doc));
  return content;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (ids.length === 0) throw new Error("pass at least one bookId");

  const sa = JSON.parse(readFileSync(resolve(scriptDir, "../../service-account.json"), "utf-8"));
  if (getApps().length === 0) initializeApp({ credential: cert(sa), projectId: sa.project_id });
  const db = getFirestore();
  console.log(`Firestore: ${sa.project_id}  |  Local: ${process.env.DATABASE_URL}  |  ${dryRun ? "DRY-RUN" : "WRITE"}\n`);

  for (const id of ids) {
    const snap = await db.collection("books").doc(id).get();
    if (!snap.exists) { console.log(`  SKIP     ${id} — not in Firestore`); continue; }
    const doc = snap.data() as AnyRec;
    const content = mapContent(doc);

    const before = await prisma.book.findUnique({ where: { id }, select: { coloringPages: true, coverUrl: true } });
    const beforePages = before ? len(before.coloringPages) : -1;
    console.log(
      `  ${before ? "OVERWRITE" : "CREATE   "} ${id}  local=${beforePages < 0 ? "∅" : beforePages}→fs=${len(doc.coloringPages)}  cover=${doc.coverUrl ? "Y" : "n"}  ${String(doc.title ?? "").slice(0, 45)}`,
    );
    if (dryRun) continue;

    if (before) {
      await prisma.book.update({ where: { id }, data: content as never });
    } else {
      await prisma.book.create({ data: { id, ...content, data: { queueStatus: "todo" } } as never });
    }
  }
  console.log(`\n${dryRun ? "[DRY-RUN] " : ""}Done.`);
}

main()
  .catch((e) => { console.error("FAIL:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
