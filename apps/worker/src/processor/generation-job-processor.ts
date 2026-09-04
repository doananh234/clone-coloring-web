import crypto from "node:crypto";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { prisma } from "@vx/db";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import {
  generateCoverSourceBW,
  generateCoverSource,
  editImage,
  usesCompactPrompts,
} from "@vx/server-core/ai";
import { generateAiCover, buildCoverTypographyPrompt, buildCoverTypographyPromptCompact } from "@vx/server-core/cover-generation";
import { collectExportPlan, buildExportZip, stableExportUrl, type ExportInput, type ExportPageLike } from "@vx/server-core/book-export";

type Page = { id?: string; url?: string };
type TitleSafe = "top" | "middle" | "bottom";
type SourceCoverPayload = {
  interiorPageId: string;
  titleSafe: TitleSafe;
  prompt?: string;
  sourceImageUrl?: string;
  /** Operator-chosen image backend; undefined → worker's IMAGE_PROVIDER default. */
  provider?: "kingcong" | "diaflow" | "litellm" | "azure";
  /** Operator-chosen LiteLLM model id (e.g. "gpt-image-2"); undefined → LITELLM_IMAGE_MODEL. */
  model?: string;
};
type SourceCover = {
  id: string;
  url: string;
  isPublic: boolean;
  titleSafe: TitleSafe;
  sourceInteriorId: string;
  createdAt: string;
};

/** Payload for the interactive "compose cover" flow (2-phase: source → typography). */
type ComposeCoverPayload = {
  title: string;
  imageDataUrls: string[];
  brand?: string;
  style?: string;
  bookId: string;
};

/** Payload for the interactive "AI cover" flow (1-phase generateAiCover). */
type AiCoverPayload = {
  bookId: string;
  backgroundImageUrl: string;
  brandName?: string;
  model?: string;
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
    } else if (job.type === "compose-cover") {
      await runComposeCover(job.id, job.bookId, job.payload as unknown as ComposeCoverPayload);
    } else if (job.type === "ai-cover") {
      await runAiCover(job.id, job.bookId, job.payload as unknown as AiCoverPayload);
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
  const { interiorPageId, titleSafe, prompt, provider, model } = payload;
  // gpt-image-2 is an Azure image-EDIT model. LiteLLM's proxy can't forward the
  // multipart /images/edits call to Azure (it routes to the JSON-only
  // generations endpoint → 400 unsupported_content_type), so route this model
  // straight to the `azure` provider, which hits Azure's edits endpoint directly
  // (AZURE_IMAGE_DEPLOYMENT_NAME=gpt-image-2). Other models keep their provider.
  const isAzureImageModel = /gpt-image/i.test(model ?? "");
  const effectiveProvider = isAzureImageModel ? "azure" : provider;
  const effectiveModel = isAzureImageModel ? undefined : model;

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
    { provider: effectiveProvider, ...(effectiveModel ? { model: effectiveModel } : {}), trace: { caller: "worker/generation/source-cover", entityId: genJobId } },
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

// --- Interactive cover generation (moved off the sync API routes so KingCong's
// ~150s image calls don't hit Cloudflare's ~100s HTTP timeout / error 524). ---

// Book covers must be a fixed square. This final pass guarantees the exact
// 2048x2048 output (a clean upscale, no crop when the model already returned
// square). Ported verbatim from the compose-cover API route.
const COVER_SIZE = 2048;

// When the caller doesn't pass an explicit coloring/art style, tell the
// recompose pass to KEEP whatever colors the source illustration already has.
const PRESERVE_STYLE_DIRECTIVE =
  "Keep the existing colors, palette, shading, lighting and rendering of the " +
  "source illustration exactly — do not change the color scheme, only recompose " +
  "the layout as instructed.";

async function toSquareCoverBase64(base64: string, size = COVER_SIZE): Promise<string> {
  const img = await loadImage(Buffer.from(base64, "base64"));
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return canvas.toBuffer("image/png").toString("base64");
}

/**
 * Interactive "compose cover" (cover-thumbnail-step) — 2-phase. Mirrors the old
 * sync POST /api/generate/compose-cover exactly:
 *   Phase 1 — generateCoverSource: recompose the picked illustration into a clean
 *     text-free cover LAYOUT (GPT-image flow forced inside).
 *   Phase 2 — editImage with the KDP typography prompt (compact variant when the
 *     provider caps prompts, e.g. KingCong).
 * Then squares to exactly 2048x2048 and uploads the final PNG to R2.
 */
async function runComposeCover(genJobId: string, bookId: string, payload: ComposeCoverPayload): Promise<void> {
  const { title, imageDataUrls, brand, style } = payload;
  if (!title || !imageDataUrls?.length) throw new Error("title and imageDataUrls are required");

  // The FIRST selected illustration is the base being turned into a cover;
  // any extras act as style/scene references for the recompose pass.
  const [primary, ...refs] = imageDataUrls;
  const directive = style?.trim() ? style.trim() : PRESERVE_STYLE_DIRECTIVE;

  // Phase 1 — clean text-free cover-source layout (heavy image step BEFORE any DB write).
  const coverSource = await generateCoverSource(primary, directive, {
    aspectRatio: "1:1",
    referenceImageUrls: refs.length ? refs : undefined,
    trace: { caller: "worker/generation/compose-cover:source", entityId: genJobId },
  });

  // Phase 2 — overlay KDP typography. KingCong caps prompts at 4000 chars → compact variant.
  const buildTypography = usesCompactPrompts()
    ? buildCoverTypographyPromptCompact
    : buildCoverTypographyPrompt;
  const typographyPrompt = buildTypography(brand?.trim() || "", { titleHint: title });
  const composed = await editImage(coverSource.dataUrl, typographyPrompt, {
    aspectRatio: "1:1",
    flow: "gpt_image",
    trace: { caller: "worker/generation/compose-cover:typography", entityId: genJobId },
  });

  // Guarantee an exact 2048x2048 square output, then upload to R2.
  const base64 = await toSquareCoverBase64(composed.base64);
  const r2Config = getR2Config();
  const { url } = await uploadToR2({
    client: createR2Client(r2Config),
    config: r2Config,
    key: `assets/books/${bookId}/cover-ai-${genJobId}.png`,
    body: Buffer.from(base64, "base64"),
    contentType: "image/png",
  });

  await prisma.generationJob.update({
    where: { id: genJobId },
    data: { status: "done", resultUrl: url, resultId: genJobId },
  });
}

/**
 * Interactive "AI cover" (cover-editor AI panel) — 1-phase. Mirrors the old sync
 * POST /api/generate/cover-export (aiBlend=true), delegating to the shared
 * generateAiCover which keeps its existing R2 key convention.
 */
async function runAiCover(genJobId: string, bookId: string, payload: AiCoverPayload): Promise<void> {
  const { backgroundImageUrl, brandName, model } = payload;
  if (!backgroundImageUrl) throw new Error("backgroundImageUrl is required");

  const output = await generateAiCover({
    cleanImageUrl: backgroundImageUrl,
    brandName: brandName ?? "",
    ...(typeof model === "string" && model.trim() ? { model: model.trim() } : {}),
    r2Key: `assets/books/${bookId}/cover-ai.png`,
    trace: {
      caller: "worker/generation/ai-cover",
      entityType: "book",
      entityId: bookId,
    },
  });

  await prisma.generationJob.update({
    where: { id: genJobId },
    data: { status: "done", resultUrl: output.url, resultId: genJobId },
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
  // Fixed per-book key so a copied link stays valid across re-exports; the
  // object is overwritten each time. Content-Disposition gives the download a
  // title-based name despite the fixed key; Cache-Control makes the CDN
  // revalidate after an overwrite instead of serving the stale ZIP.
  const key = stableExportUrl(bookId).replace(/^\//, "");
  const { url } = await uploadToR2({
    client: createR2Client(r2Config),
    config: r2Config,
    key,
    body: buffer,
    contentType: "application/zip",
    cacheControl: "no-cache",
    contentDisposition: `attachment; filename="${plan.filename}"`,
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
