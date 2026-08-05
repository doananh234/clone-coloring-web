/**
 * Replace each book's cover image (coverUrl — the with-text "Bìa (có chữ)")
 * with a plain, text-free image so the UI shows a non-text cover by default.
 *
 * Source priority for the new cover:
 *   1. squareThumbnailUrl              (1:1 colored image — "Ảnh màu (vuông)")
 *   2. thumbnailUrl                    (3:4 thumbnail)
 *   3. data.coverMeta.sourceThumbnailUrl (text-free source used to build the cover)
 *
 * Scope: ALL books that have a usable thumbnail source.
 *
 * Safety: the current coverUrl is backed up to data.coverMeta.previousCoverUrl
 * before being overwritten (only when it holds a real value and hasn't already
 * been backed up), so the change is reversible.
 *
 * Idempotent: a book whose coverUrl already equals the resolved source is
 * skipped, so re-runs are no-ops.
 *
 * Usage (from apps/worker):
 *   yarn backfill:cover              # DRY RUN (default) — logs, writes nothing
 *   yarn backfill:cover --apply      # persist changes
 *   yarn backfill:cover --limit 5    # cap books scanned (dry-run testing)
 */
import { db } from "../db";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

type Rec = Record<string, unknown>;

const isObj = (v: unknown): v is Rec =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** A non-empty, trimmed string or null. */
function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function log(msg: string) {
  console.log(`[backfill-cover]${APPLY ? "" : " [dry-run]"} ${msg}`);
}

async function main() {
  const books = await db.book.findMany({
    select: {
      id: true,
      title: true,
      coverUrl: true,
      squareThumbnailUrl: true,
      thumbnailUrl: true,
      data: true,
    },
  });

  let scanned = 0;
  let changed = 0;
  let skippedNoSource = 0;
  let skippedAlreadyPlain = 0;
  let writeErrors = 0;

  for (const book of books) {
    if (scanned >= LIMIT) break;
    scanned++;

    const data: Rec = isObj(book.data) ? { ...book.data } : {};
    const coverMeta: Rec = isObj(data.coverMeta) ? { ...data.coverMeta } : {};

    // Resolve the text-free replacement image by priority.
    const source =
      str(book.squareThumbnailUrl) ||
      str(book.thumbnailUrl) ||
      str(coverMeta.sourceThumbnailUrl);

    if (!source) {
      skippedNoSource++;
      continue;
    }

    const currentCover = str(book.coverUrl);
    if (currentCover === source) {
      skippedAlreadyPlain++;
      continue;
    }

    // Back up the existing cover once, only if there's a real value to keep.
    if (currentCover && !str(coverMeta.previousCoverUrl)) {
      coverMeta.previousCoverUrl = currentCover;
    }
    data.coverMeta = coverMeta;

    changed++;
    log(
      `FIX  ${book.id} "${String(book.title).slice(0, 30)}" — cover ${
        currentCover ? `"${currentCover.slice(0, 40)}…"` : "(empty)"
      } -> "${source.slice(0, 40)}…"`,
    );

    if (APPLY) {
      try {
        await db.book.update({
          where: { id: book.id },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json input
          data: { coverUrl: source, data: data as any },
        });
      } catch (e) {
        writeErrors++;
        console.error(
          `  ! write failed ${book.id}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
  }

  log(
    `done. scanned=${scanned} changed=${changed} ` +
      `skippedNoSource=${skippedNoSource} skippedAlreadyPlain=${skippedAlreadyPlain} ` +
      `writeErrors=${writeErrors}`,
  );
  if (!APPLY) log("DRY RUN — nothing written. Re-run with --apply to persist.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
