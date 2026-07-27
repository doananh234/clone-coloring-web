/**
 * Backfill / repair per-page analyze data (sceneData + prompt) on book
 * coloringPages. Two problems, both from create-book history:
 *
 *   1. MALFORMED sceneData — the worker step used `sceneData: { ...p.rawData }`;
 *      when rawData was a JSON string it spread into numeric keys ("0".."N").
 *      (The worker code is now fixed via normalizeRawData; this repairs rows
 *      already written.)
 *   2. MISSING sceneData — pages that have no sceneData though the source clone
 *      job analyzed them.
 *
 * Repair strategy per book:
 *   - Resolve source job from `book.data.cloneJobId` / `book.data.sourceCloneJobId`.
 *   - If the job's usable page count matches the book's, re-derive each page's
 *     sceneData from `job.pages[i].rawData` (authoritative, full passthrough) and
 *     fill missing prompts.
 *   - For malformed pages with no usable job, repair in place: keep the real keys
 *     (drop numeric ones), or reconstruct the JSON string from the numeric keys.
 *
 * Usage (from apps/worker):
 *   yarn backfill:scene              # DRY RUN (default) — logs, writes nothing
 *   yarn backfill:scene --apply      # persist changes
 *   yarn backfill:scene --limit 5    # cap books scanned (dry-run testing)
 */
import { db } from "../db";
import { normalizeRawData } from "@vx/clone-core";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

type Rec = Record<string, unknown>;
type Page = Rec & { sceneData?: unknown; prompt?: unknown; url?: unknown };

const isObj = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const isMalformed = (sd: unknown): boolean => isObj(sd) && Object.prototype.hasOwnProperty.call(sd, "0");

function log(msg: string) {
  console.log(`[backfill-scene]${APPLY ? "" : " [dry-run]"} ${msg}`);
}

/** Recover a malformed (numeric-key) sceneData in place. */
function repairMalformed(sd: Rec): Rec {
  const stripped: Rec = {};
  for (const [k, v] of Object.entries(sd)) if (!/^\d+$/.test(k)) stripped[k] = v;
  if (stripped.scene !== undefined || stripped.characters !== undefined || stripped.locations !== undefined || stripped.environment !== undefined) {
    return stripped;
  }
  // Only numeric keys → reconstruct the original JSON string and parse.
  const idx = Object.keys(sd).filter((k) => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
  let s = "";
  for (const i of idx) {
    const ch = sd[String(i)];
    if (typeof ch !== "string") return stripped;
    s += ch;
  }
  try {
    const parsed: unknown = JSON.parse(s);
    return isObj(parsed) ? parsed : stripped;
  } catch {
    return stripped;
  }
}

async function main() {
  log(`scanning books… ${APPLY ? "WRITES ENABLED" : "no writes"}`);
  const books = await db.book.findMany({ select: { id: true, title: true, coloringPages: true, data: true } });
  log(`total books: ${books.length}`);

  let scanned = 0, changedBooks = 0, repairedPages = 0, filledPages = 0, skippedNoJob = 0, writeErrors = 0;

  for (const book of books) {
    if (scanned >= LIMIT) break;
    scanned++;
    const pages = (Array.isArray(book.coloringPages) ? book.coloringPages : []) as Page[];
    if (pages.length === 0) continue;

    const hasMalformed = pages.some((p) => isMalformed(p.sceneData));
    const hasMissing = pages.some((p) => !p.sceneData);
    if (!hasMalformed && !hasMissing) continue;

    const data = (isObj(book.data) ? book.data : {}) as Rec;
    const jobId = (data.cloneJobId as string) || (data.sourceCloneJobId as string) || "";
    let jobPages: Array<Rec & { rawData?: unknown; redesignPrompt?: unknown; imageUrl?: unknown; redesignedUrl?: unknown }> = [];
    if (jobId) {
      const job = await db.cloneJob.findUnique({ where: { id: jobId }, select: { pages: true } });
      const jp = (Array.isArray(job?.pages) ? job!.pages : []) as typeof jobPages;
      jobPages = jp.filter((p) => p.imageUrl || p.redesignedUrl);
    }
    const aligned = jobPages.length === pages.length; // safe to re-derive by index

    let repaired = 0, filled = 0;
    const nextPages = pages.map((p, i) => {
      const jp = aligned ? jobPages[i] : undefined;

      const jobRaw = jp && (isObj(jp.rawData) || typeof jp.rawData === "string") ? jp.rawData : undefined;

      if (isMalformed(p.sceneData)) {
        const sceneData = jobRaw !== undefined ? normalizeRawData(jobRaw) : repairMalformed(p.sceneData as Rec);
        repaired++;
        const prompt = (p.prompt as string) || (jp?.redesignPrompt as string) || "";
        return { ...p, sceneData, prompt };
      }

      if (!p.sceneData && jobRaw !== undefined) {
        const sceneData = normalizeRawData(jobRaw);
        if (sceneData) {
          filled++;
          const repro = typeof sceneData.reproductionPrompt === "string" ? sceneData.reproductionPrompt : "";
          return { ...p, sceneData, prompt: (p.prompt as string) || (jp?.redesignPrompt as string) || repro || "" };
        }
      }
      return p;
    });

    if (repaired === 0 && filled === 0) {
      if (hasMalformed && !aligned) { skippedNoJob++; log(`SKIP ${book.id} "${String(book.title).slice(0, 30)}" — malformed but no aligned job`); }
      continue;
    }

    changedBooks++;
    repairedPages += repaired;
    filledPages += filled;
    log(`FIX  ${book.id} "${String(book.title).slice(0, 30)}" — repaired=${repaired} filled=${filled}${aligned ? "" : " (in-place, no job)"}`);

    if (APPLY) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json input
        await db.book.update({ where: { id: book.id }, data: { coloringPages: nextPages as any } });
      } catch (e) {
        writeErrors++;
        console.error(`  ! write failed ${book.id}:`, e instanceof Error ? e.message : e);
      }
    }
  }

  log(`done. scanned=${scanned} changedBooks=${changedBooks} repairedPages=${repairedPages} filledPages=${filledPages} skippedNoJob=${skippedNoJob} writeErrors=${writeErrors}`);
  if (!APPLY) log("DRY RUN — nothing written. Re-run with --apply to persist.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
