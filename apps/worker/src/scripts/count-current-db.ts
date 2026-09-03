/**
 * READ-ONLY: count rows per table in the CURRENTLY configured DB (whatever
 * DATABASE_URL resolves to). Prints the target host so you can confirm which DB
 * the app is actually reading.
 *
 * Usage (from apps/worker):  node --import tsx src/scripts/count-current-db.ts
 */
import { prisma } from "@vx/db";

const MODELS = [
  "app", "book", "category", "brand", "character", "location", "artStyle",
  "coloringStyle", "sourceBook", "purchase", "wallet", "user", "creditLedger",
  "cloneJob", "cloneJobStatusCount", "generationJob", "font", "coverTextOverlay",
  "userColoring", "operator",
] as const;

async function main() {
  const url = process.env.DATABASE_URL ?? "(unset)";
  const target = url.replace(/:[^:@/]+@/, ":****@");
  console.log(`DATABASE_URL → ${target}\n`);

  let total = 0;
  for (const m of MODELS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n = await (prisma as any)[m].count();
    total += n;
    console.log(`  ${m.padEnd(20)} : ${n}`);
  }
  console.log(`\nTotal: ${total}`);
}

main()
  .catch((e) => { console.error("FAIL:", e instanceof Error ? e.message : e); process.exit(1); })
  .finally(() => prisma.$disconnect());
