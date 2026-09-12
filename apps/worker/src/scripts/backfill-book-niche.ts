/**
 * Denormalize niche + priority của SourceBook nguồn lên Book.data (`niche`,
 * `nicheLower` cho tìm kiếm không phân biệt hoa thường, và `priority`) để trang
 * Books lọc/hiển thị được mà không cần join mỗi request.
 *
 * Niche lineage (the value already exists upstream, just not on the book):
 *   Book.data.cloneJobId (or data.sourceCloneJobId)
 *     -> CloneJob.data.sourceBookId
 *       -> SourceBook.niche / SourceBook.priority
 *
 * Scope: ALL books whose lineage resolves to a non-empty niche.
 * Idempotent: a book whose data.niche already matches is skipped.
 *
 * Usage (from apps/worker):
 *   yarn backfill:niche              # DRY RUN (default) — logs, writes nothing
 *   yarn backfill:niche --apply      # persist changes
 *   yarn backfill:niche --limit 5    # cap books scanned (dry-run testing)
 */
import { db } from "../db";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

type Rec = Record<string, unknown>;

const isObj = (v: unknown): v is Rec =>
  !!v && typeof v === "object" && !Array.isArray(v);

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function log(msg: string) {
  console.log(`[backfill-niche]${APPLY ? "" : " [dry-run]"} ${msg}`);
}

async function main() {
  const books = await db.book.findMany({
    select: { id: true, title: true, data: true },
  });

  // Batch-resolve the two upstream hops to avoid N+1 queries.
  const jobIds = new Set<string>();
  for (const b of books) {
    const data = isObj(b.data) ? b.data : {};
    const jobId = str(data.cloneJobId) || str(data.sourceCloneJobId);
    if (jobId) jobIds.add(jobId);
  }

  const jobs = await db.cloneJob.findMany({
    where: { id: { in: [...jobIds] } },
    select: { id: true, data: true },
  });
  const sourceBookIdByJob = new Map<string, string>();
  const sourceBookIds = new Set<string>();
  for (const j of jobs) {
    const jd = isObj(j.data) ? j.data : {};
    const sbId = str(jd.sourceBookId);
    if (sbId) {
      sourceBookIdByJob.set(j.id, sbId);
      sourceBookIds.add(sbId);
    }
  }

  const sourceBooks = await db.sourceBook.findMany({
    where: { id: { in: [...sourceBookIds] } },
    select: { id: true, niche: true, priority: true },
  });
  const tagsBySourceBook = new Map<string, { niche?: string; priority?: string }>();
  for (const sb of sourceBooks) {
    const tags: { niche?: string; priority?: string } = {};
    const n = str(sb.niche);
    const p = str(sb.priority);
    if (n) tags.niche = n;
    if (p) tags.priority = p;
    if (n || p) tagsBySourceBook.set(sb.id, tags);
  }

  let scanned = 0;
  let changed = 0;
  let skippedNoNiche = 0;
  let skippedUnchanged = 0;
  let writeErrors = 0;

  for (const book of books) {
    if (scanned >= LIMIT) break;
    scanned++;

    const data: Rec = isObj(book.data) ? { ...book.data } : {};
    const jobId = str(data.cloneJobId) || str(data.sourceCloneJobId);
    const sbId = jobId ? sourceBookIdByJob.get(jobId) : undefined;

    const tags = sbId ? tagsBySourceBook.get(sbId) : undefined;
    const niche = tags?.niche;
    const priority = tags?.priority;

    if (!niche && !priority) {
      skippedNoNiche++;
      continue;
    }

    const nicheLower = niche?.toLowerCase();
    const nicheSame = !niche || (str(data.niche) === niche && str(data.nicheLower) === nicheLower);
    const prioritySame = !priority || str(data.priority) === priority;
    if (nicheSame && prioritySame) {
      skippedUnchanged++;
      continue;
    }

    if (niche) {
      data.niche = niche;
      data.nicheLower = nicheLower;
    }
    if (priority) data.priority = priority;

    changed++;
    log(
      `FIX  ${book.id} "${String(book.title).slice(0, 30)}" — ` +
        `niche=${niche ? `"${niche}"` : "—"} priority=${priority ? `"${priority}"` : "—"}`,
    );

    if (APPLY) {
      try {
        await db.book.update({
          where: { id: book.id },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json input
          data: { data: data as any },
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
      `skippedNoNiche=${skippedNoNiche} skippedUnchanged=${skippedUnchanged} ` +
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
