import type { BookColoringPage } from "./types";
// Re-export so server-side callers (worker repair script) can take the type and
// the helper from this one pure module — same pattern as page-variants.ts.
export type { BookColoringPage };

/**
 * Finds book pages whose current image was regenerated from the WRONG source
 * page.
 *
 * Until the index-space fix, the book screen sent an index into the book's
 * interior-only coloringPages to /clone/[jobId]/reproduce, which used it to
 * index the job's full page array — so regenerating interior #5 could redraw
 * the cover. The damage is detectable because reproduce uploads to a key that
 * embeds the source page number it actually used:
 *
 *   assets/clone-jobs/<jobId>/reproduce/page-<NNN>-<regen|angle>.png
 *
 * A page whose url carries a NNN different from its own sourcePageNumber was
 * built from someone else's source page. Pages regenerated from the jobs
 * compare screen (correct index) carry a matching NNN and are left alone, as
 * are pages redrawn through the id-addressed /pages/[pageId]/regen path, which
 * never had the bug.
 */
export interface MisregenFinding {
  pageId: string;
  sourcePageNumber: number;
  /** The source page the image was actually generated from. */
  wrongSourcePageNumber: number;
  currentUrl: string;
  /** The image create-book originally copied this page from. */
  restoreUrl: string;
}

export interface JobPageRef {
  pageNumber: number;
  imageUrl?: string;
  redesignedUrl?: string;
}

export function findMisregeneratedPages(
  pages: BookColoringPage[],
  jobPages: JobPageRef[],
  cloneJobId: string,
): MisregenFinding[] {
  const pattern = new RegExp(
    `/clone-jobs/${escapeRegExp(cloneJobId)}/reproduce/page-(\\d+)-(?:regen|angle)\\.png$`,
  );

  const findings: MisregenFinding[] = [];
  for (const page of pages) {
    if (page.sourcePageNumber == null) continue;
    // Strip the ?v= cache-buster reproduce appends before matching the key.
    const url = (page.url || "").split("?")[0];
    const m = pattern.exec(url);
    if (!m) continue;

    const usedPageNumber = Number(m[1]);
    if (usedPageNumber === page.sourcePageNumber) continue;

    const source = jobPages.find((p) => p.pageNumber === page.sourcePageNumber);
    const restoreUrl = source?.redesignedUrl || source?.imageUrl;
    // No source page left in the job → nothing trustworthy to restore from;
    // report nothing rather than invent a replacement.
    if (!restoreUrl) continue;

    findings.push({
      pageId: page.id,
      sourcePageNumber: page.sourcePageNumber,
      wrongSourcePageNumber: usedPageNumber,
      currentUrl: page.url,
      restoreUrl,
    });
  }
  return findings;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
