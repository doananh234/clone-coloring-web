import type { PrismaClient } from "@vx/db";
import type { JobContext } from "../job-context";

export const DEFAULT_TARGET_INTERIOR = 40;
export const FILL_CHANGE_BASE = 40;
export const FILL_CHANGE_STEP = 10;
export const FILL_CHANGE_CAP = 80;

export interface FillInteriorPage {
  pageNumber: number;
  imageUrl?: string;
  pageType?: "cover" | "interiorIntro" | "interior";
  excluded?: boolean;
  origin?: "original" | "additional";
}

export interface FillTask {
  sourceImageUrl: string;
  parentPageNumber: number;
  pageNumber: number;
  changePercent: number;
}

/** Shared with create-book: legacy (undefined pageType) counts as interior. */
const isInterior = (p: FillInteriorPage): boolean =>
  p.pageType !== "cover" && p.pageType !== "interiorIntro";

/**
 * Decide which source interiors to clone (and at what change-%) to reach `target`
 * total interior pages. Pure + deterministic given `opts.shuffle` (defaults to
 * identity so tests are stable; the worker injects a real shuffle at runtime).
 *
 * - need = max(0, target - existing interior !excluded)
 * - pool = ORIGINAL interior !excluded pages with an imageUrl
 * - pick round-robin: distinct sources until the pool is exhausted, then a new
 *   shuffled pass. Each full pass ("round") bumps change-% by FILL_CHANGE_STEP
 *   (capped) so repeated clones of the same source diverge.
 */
export function planFillInterior(
  pages: FillInteriorPage[],
  target: number,
  opts: { shuffle?: <T>(a: T[]) => T[] } = {},
): FillTask[] {
  const shuffle = opts.shuffle ?? (<T,>(a: T[]) => a);
  const existing = pages.filter((p) => isInterior(p) && !p.excluded).length;
  const need = Math.max(0, target - existing);
  const pool = pages.filter(
    (p) => p.origin !== "additional" && isInterior(p) && !p.excluded && !!p.imageUrl,
  );
  if (need === 0 || pool.length === 0) return [];

  let nextSeq = Math.max(...pages.map((p) => p.pageNumber)) + 1;
  const tasks: FillTask[] = [];
  let made = 0;
  while (made < need) {
    const round = Math.floor(made / pool.length);
    const changePercent = Math.min(
      FILL_CHANGE_CAP,
      FILL_CHANGE_BASE + round * FILL_CHANGE_STEP,
    );
    const ordered = shuffle(pool.slice());
    for (let k = 0; k < ordered.length && made < need; k++) {
      const src = ordered[k];
      tasks.push({
        sourceImageUrl: src.imageUrl as string,
        parentPageNumber: src.pageNumber,
        pageNumber: nextSeq++,
        changePercent,
      });
      made++;
    }
  }
  return tasks;
}

export interface FillInteriorDeps {
  generatePage: (a: {
    prompt: string;
    sourceImageUrl: string;
    pageNumber: number;
    jobId: string;
    changePercent?: number;
  }) => Promise<{ base64: string }>;
  uploadToR2: (a: { key: string; body: Buffer; contentType: string }) => Promise<{ url: string }>;
  shuffle?: <T>(a: T[]) => T[];
}

/**
 * stepFillInterior — clone random source interiors up to the job's target so
 * the built book has enough interior pages. Runs AFTER the D2 classify gate
 * (operator has confirmed which pages are interior/excluded) and BEFORE
 * create-book. Idempotent via ctx.isDone("fill-interior"): on gate-resume it
 * fills exactly once. Appends origin:"additional" pages; never mutates originals.
 */
export async function stepFillInterior(
  ctx: JobContext,
  db: PrismaClient,
  deps: FillInteriorDeps,
): Promise<void> {
  const job = await db.cloneJob.findUnique({ where: { id: ctx.jobId } });
  if (!job) throw new Error(`cloneJob ${ctx.jobId} missing`);

  const existingPages = (job.pages as FillInteriorPage[] | null | undefined) ?? [];
  const data = (job.data as { targetInteriorCount?: number } | null | undefined) ?? {};
  const target = data.targetInteriorCount ?? DEFAULT_TARGET_INTERIOR;

  const tasks = planFillInterior(existingPages, target, { shuffle: deps.shuffle });
  if (tasks.length === 0) {
    await ctx.markStepComplete("fill-interior");
    return;
  }

  const created: Record<string, unknown>[] = [];
  for (const t of tasks) {
    const { base64 } = await deps.generatePage({
      prompt: "",
      sourceImageUrl: t.sourceImageUrl,
      pageNumber: t.pageNumber,
      jobId: ctx.jobId,
      changePercent: t.changePercent,
    });
    const body = Buffer.from(base64, "base64");
    const key = `assets/clone-jobs/${ctx.jobId}/redesigned/page-${String(t.pageNumber).padStart(3, "0")}.png`;
    const { url } = await deps.uploadToR2({ key, body, contentType: "image/png" });
    created.push({
      pageNumber: t.pageNumber,
      imageUrl: t.sourceImageUrl,
      redesignedUrl: url,
      status: "reproduced",
      pageType: "interior",
      origin: "additional",
      parentPageNumber: t.parentPageNumber,
    });
  }

  // Re-read to merge against the freshest pages (operator edits at the gate
  // landed on job.pages; we only append, never overwrite).
  const fresh = await db.cloneJob.findUnique({ where: { id: ctx.jobId }, select: { pages: true } });
  const base = (fresh?.pages as Record<string, unknown>[] | null | undefined) ?? [];
  const merged = [...base, ...created];
  // Additional pages are fully generated ("reproduced"), so keep stepOneShot's
  // invariant totalPages == analyzedPages == pages.length — otherwise the
  // job-detail "analyzedPages/totalPages" stat and the telegram "Pages: N"
  // summary undercount by the number of pages filled.
  await db.cloneJob.updateMany({
    where: { id: ctx.jobId },
    data: { pages: merged as never, totalPages: merged.length, analyzedPages: merged.length },
  });

  await ctx.markStepComplete("fill-interior");
}
