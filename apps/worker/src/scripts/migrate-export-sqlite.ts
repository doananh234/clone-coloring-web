/**
 * PHASE 1 of SQLite → Postgres migration: dump every table from the local
 * SQLite DB to a single JSON file. Run this FIRST, while the Prisma client is
 * still generated for the sqlite provider.
 *
 * Read-only on SQLite. No relations/FKs in the schema, so a flat dump is enough.
 *
 * Usage (from apps/worker):
 *   DATABASE_URL="file:/abs/dev.db" \
 *   node --import tsx src/scripts/migrate-export-sqlite.ts [outFile]
 *
 * Default outFile: ../../../sqlite-dump.json (repo root).
 */
import { prisma } from "@vx/db";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));

// Prisma delegate names (camelCase). No @relation in schema → any order works.
const MODELS = [
  "app", "book", "category", "brand", "character", "location", "artStyle",
  "coloringStyle", "sourceBook", "purchase", "wallet", "user", "creditLedger",
  "cloneJob", "cloneJobStatusCount", "generationJob", "font", "coverTextOverlay",
  "userColoring", "operator",
] as const;

async function main() {
  const outFile = resolve(scriptDir, "../../../", process.argv[2] ?? "sqlite-dump.json");
  console.log(`Exporting SQLite [${process.env.DATABASE_URL}] → ${outFile}\n`);

  const dump: Record<string, unknown[]> = {};
  for (const m of MODELS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any)[m].findMany();
    dump[m] = rows;
    console.log(`  ${m.padEnd(20)} : ${rows.length}`);
  }

  // Date objects serialize to ISO strings; Prisma accepts ISO strings for
  // DateTime inputs on import, so no special handling is needed.
  writeFileSync(outFile, JSON.stringify(dump, null, 0), "utf-8");
  const total = Object.values(dump).reduce((n, r) => n + r.length, 0);
  console.log(`\n✅ Exported ${total} rows across ${MODELS.length} tables → ${outFile}`);
}

main()
  .catch((e) => { console.error("FAIL:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
