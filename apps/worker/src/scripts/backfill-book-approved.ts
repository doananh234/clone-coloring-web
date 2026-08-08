/**
 * One-time backfill: mark every EXISTING book as approved (isPublic = true).
 *
 * Rationale: isPublic is being repurposed as the editorial review flag
 * ("Đã duyệt" = true / "Nháp" = false). Books that already exist predate the
 * workflow and are considered reviewed, so they become approved. Books created
 * afterward by the clone pipeline keep isPublic=false → they show as "Nháp"
 * until a reviewer approves them.
 *
 * Usage:
 *   yarn backfill:book-approved            # set isPublic=true on all books
 *   yarn backfill:book-approved --dry-run  # only report how many would change
 */
import { db } from "../db";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pending = await db.book.count({ where: { isPublic: false } });
  console.log(`[backfill-book-approved] ${pending} book(s) currently isPublic=false`);
  if (dryRun) {
    console.log("[backfill-book-approved] --dry-run: no changes made.");
    return;
  }
  const res = await db.book.updateMany({ where: { isPublic: false }, data: { isPublic: true } });
  console.log(`[backfill-book-approved] updated ${res.count} book(s) → isPublic=true`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
