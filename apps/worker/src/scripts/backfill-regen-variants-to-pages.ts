/**
 * One-time migration: convert legacy per-page regen VARIANTS into real
 * additional INTERIOR pages. For each book page with variants:
 *   - revert the page to its "original" variant (url/coloredUrl),
 *   - append one additional page (origin:"additional") per "regen" variant,
 *   - strip variants + selectedVariantId.
 * Idempotent: a page without variants is left untouched.
 *
 * Usage:
 *   yarn backfill:regen-variants            # migrate
 *   yarn backfill:regen-variants --dry-run  # report only
 */
import crypto from "node:crypto";
import { db } from "../db";
import { planVariantMigration, type BookColoringPage } from "@vx/coloring/data/additional-pages";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const books = await db.book.findMany({ select: { id: true, coloringPages: true } });
  let booksChanged = 0;
  let pagesAdded = 0;

  for (const b of books) {
    const pages = (b.coloringPages as unknown as BookColoringPage[]) ?? [];
    const restored: BookColoringPage[] = [];
    const extra: BookColoringPage[] = [];
    let touched = false;

    pages.forEach((p, i) => {
      const hadVariants = Array.isArray(p.variants) && p.variants.length > 0;
      const r = planVariantMigration(p, i, () => crypto.randomUUID());
      restored.push(r.page);
      extra.push(...r.additional);
      if (hadVariants) touched = true;
    });

    if (!touched) continue;
    booksChanged++;
    pagesAdded += extra.length;
    if (!dryRun) {
      await db.book.update({
        where: { id: b.id },
        data: { coloringPages: [...restored, ...extra] as never },
      });
    }
  }

  console.log(
    `[backfill-regen-variants] ${dryRun ? "(dry-run) " : ""}books changed: ${booksChanged}, additional pages created: ${pagesAdded}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
