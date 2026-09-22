/**
 * Repairs book pages whose image was regenerated from the WRONG source page.
 *
 * Until the index-space fix, the book screen sent an index into the book's
 * interior-only coloringPages to /clone/[jobId]/reproduce, which used it to
 * index the clone job's FULL page array — so "Vẽ lại" on interior #5 could
 * redraw the cover and write it onto interior #5. findMisregeneratedPages()
 * spots those pages by the source page number embedded in the reproduce upload
 * key and resolves the image create-book originally copied the page from.
 *
 * DEFAULTS TO DRY-RUN. Nothing is written without --apply.
 *
 * Usage (from apps/worker):
 *   node --env-file=.env --import tsx src/scripts/restore-misregen-pages.ts               # scan every book
 *   node --env-file=.env --import tsx src/scripts/restore-misregen-pages.ts <bookId>...   # scan given books
 *   node --env-file=.env --import tsx src/scripts/restore-misregen-pages.ts --apply       # actually write
 */
import { prisma } from "@vx/db";
import {
  findMisregeneratedPages,
  type JobPageRef,
  type MisregenFinding,
  type BookColoringPage,
} from "@vx/coloring/data/detect-misregen-pages";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const bookIds = args.filter((a) => !a.startsWith("--"));

type BookRow = {
  id: string;
  title: string | null;
  coloringPages: unknown;
  data: unknown;
};

/**
 * Restores each finding's page url, and clears coloredUrl: the colored version
 * was derived from the wrong line art, so keeping it would leave the page
 * showing the wrong picture in colour.
 */
function repair(pages: BookColoringPage[], findings: MisregenFinding[]): BookColoringPage[] {
  const byId = new Map(findings.map((f) => [f.pageId, f]));
  return pages.map((p) => {
    const f = byId.get(p.id);
    if (!f) return p;
    const { coloredUrl: _dropped, ...rest } = p;
    return { ...rest, url: f.restoreUrl };
  });
}

async function main(): Promise<void> {
  const books = (await prisma.book.findMany({
    ...(bookIds.length ? { where: { id: { in: bookIds } } } : {}),
    select: { id: true, title: true, coloringPages: true, data: true },
  })) as BookRow[];

  console.log(`${APPLY ? "APPLY" : "DRY-RUN"} — scanning ${books.length} book(s)\n`);

  let booksHit = 0;
  let pagesHit = 0;

  for (const book of books) {
    const cloneJobId = (book.data as { cloneJobId?: string } | null)?.cloneJobId;
    if (!cloneJobId) continue;

    const pages = (book.coloringPages as BookColoringPage[] | null) ?? [];
    if (pages.length === 0) continue;

    const job = await prisma.cloneJob.findUnique({
      where: { id: cloneJobId },
      select: { pages: true },
    });
    const jobPages = ((job?.pages as JobPageRef[] | null) ?? []).filter((p) => p && p.pageNumber != null);
    if (jobPages.length === 0) continue;

    const findings = findMisregeneratedPages(pages, jobPages, cloneJobId);
    if (findings.length === 0) continue;

    booksHit += 1;
    pagesHit += findings.length;
    console.log(`BOOK ${book.id}  ${book.title ?? "(untitled)"}  — ${findings.length} bad page(s)`);
    for (const f of findings) {
      console.log(
        `   page #${f.sourcePageNumber} (id ${f.pageId}) was drawn from source #${f.wrongSourcePageNumber}`,
      );
      console.log(`      now:     ${f.currentUrl}`);
      console.log(`      restore: ${f.restoreUrl}`);
    }

    if (APPLY) {
      await prisma.book.update({
        where: { id: book.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { coloringPages: repair(pages, findings) as any },
      });
      console.log(`   -> restored\n`);
    } else {
      console.log("");
    }
  }

  console.log(
    `\n${APPLY ? "Restored" : "Would restore"} ${pagesHit} page(s) across ${booksHit} book(s).` +
      (APPLY ? "" : "\nRe-run with --apply to write."),
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
