/**
 * READ-ONLY diagnostic: compare Firestore `books` (prod) against the local
 * Prisma DB. Writes NOTHING. Reports:
 *   - missingLocally   : in Firestore, absent locally  → LOST books to restore
 *   - partialLocally   : present locally but coloringPages/cover thinner than
 *                        Firestore → partial data loss
 *   - localOnly        : present locally, absent in Firestore → unpublished WIP
 *
 * Usage (from apps/worker):
 *   DATABASE_URL="file:/abs/dev.db" node --import tsx src/scripts/diagnose-firestore-vs-db.ts
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "@vx/db";

const scriptDir = dirname(fileURLToPath(import.meta.url));

interface Row {
  id: string;
  title: string;
  pages: number;
  hasCover: boolean;
}

function len(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

async function main() {
  const sa = JSON.parse(readFileSync(resolve(scriptDir, "../../service-account.json"), "utf-8"));
  if (getApps().length === 0) initializeApp({ credential: cert(sa), projectId: sa.project_id });
  const db = getFirestore();

  console.log(`Firestore project : ${sa.project_id}`);
  console.log(`Local DB          : ${process.env.DATABASE_URL}\n`);

  // --- Firestore books (read-only) ---
  const snap = await db.collection("books").get();
  const fs = new Map<string, Row>();
  for (const d of snap.docs) {
    const data = d.data();
    fs.set(d.id, {
      id: d.id,
      title: String(data.title ?? "(no title)"),
      pages: len(data.coloringPages),
      hasCover: Boolean(data.coverUrl),
    });
  }

  // --- Local DB books ---
  const localBooks = await prisma.book.findMany({
    select: { id: true, title: true, coverUrl: true, coloringPages: true, data: true },
  });
  const local = new Map<string, Row & { queueStatus: string }>();
  for (const b of localBooks) {
    local.set(b.id, {
      id: b.id,
      title: b.title ?? "(no title)",
      pages: len(b.coloringPages),
      hasCover: Boolean(b.coverUrl),
      queueStatus: String((b.data as { queueStatus?: unknown } | null)?.queueStatus ?? "todo"),
    });
  }

  const missingLocally: Row[] = [];
  const partialLocally: { id: string; title: string; local: number; fs: number; queueStatus: string; coverLostFs: boolean }[] = [];
  for (const [id, r] of fs) {
    const l = local.get(id);
    if (!l) {
      missingLocally.push(r);
    } else if (r.pages > l.pages || (r.hasCover && !l.hasCover)) {
      partialLocally.push({
        id,
        title: r.title,
        local: l.pages,
        fs: r.pages,
        queueStatus: l.queueStatus,
        coverLostFs: r.hasCover && !l.hasCover,
      });
    }
  }
  const localOnly = [...local.values()].filter((l) => !fs.has(l.id));

  console.log(`Firestore books   : ${fs.size}`);
  console.log(`Local books       : ${local.size}\n`);

  console.log(`── MISSING LOCALLY (in Firestore, gone from local) : ${missingLocally.length} ──`);
  for (const r of missingLocally.sort((a, b) => b.pages - a.pages)) {
    console.log(`  ${r.id}  pages=${String(r.pages).padStart(3)}  cover=${r.hasCover ? "Y" : "n"}  ${r.title.slice(0, 50)}`);
  }

  console.log(`\n── PARTIAL LOCALLY (local thinner than Firestore) : ${partialLocally.length} ──`);
  for (const r of partialLocally.sort((a, b) => b.fs - a.fs)) {
    console.log(`  ${r.id}  local=${String(r.local).padStart(3)} fs=${String(r.fs).padStart(3)}  ${r.coverLostFs ? "COVER-LOST " : ""}q=${r.queueStatus}  ${r.title.slice(0, 40)}`);
  }

  console.log(`\n── LOCAL-ONLY (unpublished WIP, NOT in Firestore) : ${localOnly.length} ──`);
  for (const r of localOnly.slice(0, 60)) {
    console.log(`  ${r.id}  pages=${String(r.pages).padStart(3)}  q=${r.queueStatus}  ${r.title.slice(0, 45)}`);
  }
  if (localOnly.length > 60) console.log(`  … +${localOnly.length - 60} more`);

  console.log(`\nSummary: restore ${missingLocally.length} missing, refresh ${partialLocally.length} partial. (${localOnly.length} local-only untouched.)`);
}

main()
  .catch((e) => { console.error("FAIL:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
