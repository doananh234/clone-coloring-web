/**
 * PHASE 3 of SQLite → Postgres migration: load the JSON dump into Postgres.
 * Run AFTER switching the Prisma provider to postgresql, `prisma generate`, and
 * `prisma db push` (so the Postgres tables exist and the client targets them).
 *
 * Idempotent: upserts by primary key, so it is safe to re-run. `updatedAt`
 * (@updatedAt) is dropped from each row so Prisma stamps it; `createdAt` is
 * preserved. No FKs in the schema → any insert order works.
 *
 * Usage (from apps/worker):
 *   DATABASE_URL="postgresql://postgres:PWD@db.<ref>.supabase.co:5432/postgres" \
 *   node --import tsx src/scripts/migrate-import-postgres.ts [inFile] [--dry-run]
 *
 * Default inFile: ../../../sqlite-dump.json (repo root).
 */
import { prisma } from "@vx/db";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));

const MODELS = [
  "app", "book", "category", "brand", "character", "location", "artStyle",
  "coloringStyle", "sourceBook", "purchase", "wallet", "user", "creditLedger",
  "cloneJob", "cloneJobStatusCount", "generationJob", "font", "coverTextOverlay",
  "userColoring", "operator",
] as const;

type Row = Record<string, unknown>;

/** Primary-key selector. CloneJobStatusCount keys on `status`; all others on `id`. */
function whereFor(model: string, row: Row): Row {
  if (model === "cloneJobStatusCount") return { status: row.status };
  return { id: row.id };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const replace = args.includes("--replace"); // wipe every table first → exact mirror of the dump
  const inArg = args.find((a) => !a.startsWith("--")) ?? "sqlite-dump.json";
  const inFile = resolve(scriptDir, "../../../", inArg);

  const url = process.env.DATABASE_URL ?? "";
  if (!dryRun && !url.startsWith("postgres")) {
    throw new Error(`DATABASE_URL is not Postgres ("${url.slice(0, 20)}…"). Refusing to import into a non-Postgres DB.`);
  }
  console.log(`Importing ${inFile} → [${url.replace(/:[^:@/]+@/, ":****@")}]  ${dryRun ? "DRY-RUN" : "WRITE"}${replace ? "  [REPLACE: wipe first]" : ""}\n`);

  const dump = JSON.parse(readFileSync(inFile, "utf-8")) as Record<string, Row[]>;

  if (replace && !dryRun) {
    // No FKs in the schema → deleteMany in any order is safe.
    for (const m of MODELS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const del = await (prisma as any)[m].deleteMany({});
      console.log(`  wiped ${m.padEnd(20)} : ${del.count}`);
    }
    console.log("");
  }

  const CHUNK = 100;
  let total = 0;
  for (const m of MODELS) {
    const rows = (dump[m] ?? []).map((raw) => {
      const row: Row = { ...raw };
      delete row.updatedAt; // @updatedAt — let Prisma stamp it
      return row;
    });
    if (!dryRun) {
      if (replace) {
        // Table was wiped above → plain batched insert is far fewer round-trips
        // than per-row upsert (critical over a far/pooled connection).
        for (let i = 0; i < rows.length; i += CHUNK) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma as any)[m].createMany({ data: rows.slice(i, i + CHUNK) });
        }
      } else {
        for (const row of rows) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma as any)[m].upsert({ where: whereFor(m, row), create: row, update: row });
        }
      }
    }
    total += rows.length;
    console.log(`  ${m.padEnd(20)} : ${rows.length}`);
  }

  console.log(`\n${dryRun ? "[DRY-RUN] " : "✅ "}Imported ${total} rows across ${MODELS.length} tables.`);
}

main()
  .catch((e) => { console.error("FAIL:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
