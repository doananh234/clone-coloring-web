import crypto from "node:crypto";
import { prisma } from "@vx/db";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import { generateCoverSourceBW } from "@vx/server-core/ai";
import { collectExportPlan, buildExportZip, type ExportInput, type ExportPageLike } from "@vx/server-core/book-export";

type Page = { id?: string; url?: string };
type TitleSafe = "top" | "middle" | "bottom";
type SourceCoverPayload = {
  interiorPageId: string;
  titleSafe: TitleSafe;
  prompt?: string;
  sourceImageUrl?: string;
};
type SourceCover = {
  id: string;
  url: string;
  isPublic: boolean;
  titleSafe: TitleSafe;
  sourceInteriorId: string;
  createdAt: string;
};

/**
 * Process one background GenerationJob. Sets status running → done/error and
 * stores the result. Errors are recorded on the row AND rethrown so BullMQ marks
 * the queue job failed (visible in the admin queue board).
 */
export async function processGenerationJob(generationJobId: string): Promise<void> {
  const job = await prisma.generationJob.findUnique({ where: { id: generationJobId } });
  if (!job) return;
  if (job.status === "done") return; // idempotent re-delivery

  await prisma.generationJob.update({
    where: { id: generationJobId },
    data: { status: "running", error: null },
  });

  try {
    if (job.type === "source-cover") {
      await runSourceCover(job.id, job.bookId, job.payload as unknown as SourceCoverPayload);
    } else if (job.type === "book-export") {
      await runBookExport(job.id, job.bookId);
    } else {
      throw new Error(`Unknown generation job type: ${job.type}`);
    }
  } catch (err) {
    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: { status: "error", error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}

async function runSourceCover(genJobId: string, bookId: string, payload: SourceCoverPayload): Promise<void> {
  const { interiorPageId, titleSafe, prompt } = payload;

  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) throw new Error("Book not found");
  const pages = (book.coloringPages as Page[] | null) ?? [];
  const interior = pages.find((p) => p.id === interiorPageId);
  if (!interior?.url) throw new Error("Interior page not found");

  // Heavy step (Diaflow ~2min) — done BEFORE the DB transaction so we never hold
  // a row lock across a network call.
  const img = await generateCoverSourceBW(
    resolveR2Url(interior.url),
    titleSafe,
    { trace: { caller: "worker/generation/source-cover", entityId: genJobId } },
    prompt && prompt.trim() ? prompt : undefined,
  );

  const scId = crypto.randomUUID();
  const r2Config = getR2Config();
  const buffer = Buffer.from(img.dataUrl.split(",")[1], "base64");
  const { url } = await uploadToR2({
    client: createR2Client(r2Config),
    config: r2Config,
    key: `assets/${bookId}/source-covers/${scId}.png`,
    body: buffer,
    contentType: "image/png",
  });

  const sourceCover: SourceCover = {
    id: scId,
    url,
    isPublic: false,
    titleSafe,
    sourceInteriorId: interiorPageId,
    createdAt: new Date().toISOString(),
  };

  // Append inside a short interactive transaction: concurrent source-cover jobs
  // for the SAME book would otherwise lose each other's writes to book.data.
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.book.findUnique({ where: { id: bookId } });
    const data = (fresh?.data as Record<string, unknown> | null) ?? {};
    const sourceCovers = [...((data.sourceCovers as SourceCover[] | undefined) ?? []), sourceCover];
    await tx.book.update({ where: { id: bookId }, data: { data: { ...data, sourceCovers } as never } });
  });

  await prisma.generationJob.update({
    where: { id: genJobId },
    data: { status: "done", resultUrl: url, resultId: scId },
  });
}

/** Build the book's export ZIP, upload to R2, and cache the link on the book. */
async function runBookExport(genJobId: string, bookId: string): Promise<void> {
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) throw new Error("Book not found");

  const data = (book.data as Record<string, unknown> | null) ?? {};
  const cloneJobId = typeof data.cloneJobId === "string" ? data.cloneJobId : undefined;
  const cloneJob = cloneJobId ? await prisma.cloneJob.findUnique({ where: { id: cloneJobId } }) : null;

  const input: ExportInput = {
    bookTitle: book.title,
    bookData: data,
    coverUrl: book.coverUrl,
    summaryPages: (book.summaryPages as ExportPageLike[] | null) ?? [],
    coloringPages: (book.coloringPages as ExportPageLike[] | null) ?? [],
    cloneJobPages: (cloneJob?.pages as ExportPageLike[] | null) ?? null,
    cloneJobId,
  };

  const plan = collectExportPlan(input);
  const buffer = await buildExportZip(plan); // heavy: many R2 fetches + deflate

  const r2Config = getR2Config();
  const { url } = await uploadToR2({
    client: createR2Client(r2Config),
    config: r2Config,
    key: `assets/${bookId}/exports/${plan.filename}`,
    body: buffer,
    contentType: "application/zip",
  });

  const builtAt = new Date().toISOString();
  // Read-modify-write book.data in a short transaction (mirror runSourceCover)
  // so a concurrent write to book.data can't clobber the cached export link.
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.book.findUnique({ where: { id: bookId } });
    const d = (fresh?.data as Record<string, unknown> | null) ?? {};
    await tx.book.update({
      where: { id: bookId },
      data: { data: { ...d, export: { url, hash: plan.hash, builtAt, filename: plan.filename } } as never },
    });
  });

  await prisma.generationJob.update({
    where: { id: genJobId },
    data: { status: "done", resultUrl: url, resultId: plan.hash },
  });
}
