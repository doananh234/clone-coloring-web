import crypto from "node:crypto";
import {
  getR2Config,
  createR2Client,
  uploadToR2 as r2Upload,
  copyR2Object,
  resolveR2Url,
} from "@vx/server-core/r2";
import { renderPdfToImages } from "@vx/server-core/pdf-renderer";
import { visionAnalyzeJSON, cloneOneShot, recheckOneShotSession } from "@vx/server-core/ai/llm-provider";
import {
  CLONE_EXTRACTION_PROMPT,
  buildReproductionPrompt,
  buildRedesignPrompt,
} from "@vx/server-core/ai/prompts";
import {
  buildBookMetaPrompt,
  type BookMetaGenerationResult,
} from "@vx/server-core/ai/prompts/book-meta-prompt";
import {
  generateCharacterReference,
  generateLocationReference,
  editImage,
} from "@vx/server-core/ai";
// generateCoverDeps is SHARED — the single copy lives in @vx/server-core so the
// worker and the admin's /api/clone/regenerate-covers route use the same wiring.
import { generateCoverDeps } from "@vx/server-core/cover-generation/clone-cover-deps";

const r2Config = getR2Config();
const r2Client = createR2Client(r2Config);

async function uploadToR2(args: { key: string; body: Buffer; contentType: string }) {
  return r2Upload({ client: r2Client, config: r2Config, ...args });
}

// Moves a clone-job page image into the book's permanent assets/{bookId}/
// prefix via a server-side R2 copy (no download/re-upload). Leaves external
// or already-empty URLs untouched — only internal "/assets/..." paths are
// ours to move.
async function copyImage(args: { sourceUrl: string; destKey: string }): Promise<string> {
  const { sourceUrl, destKey } = args;
  if (!sourceUrl || sourceUrl.startsWith("http://") || sourceUrl.startsWith("https://")) {
    return sourceUrl;
  }
  const sourceKey = sourceUrl.replace(/^\//, "").split("?")[0];
  const { url } = await copyR2Object({ client: r2Client, config: r2Config, sourceKey, destKey });
  return url;
}

async function readPdfFromR2(key: string): Promise<Buffer> {
  const url = resolveR2Url(`/${key}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchPdf(url: string): Promise<Buffer> {
  // SourceBook.bookUrl can be a relative R2 path (manual upload) or an absolute
  // URL (CSV import from external host). resolveR2Url no-ops on absolute URLs.
  const absolute = url.startsWith("http://") || url.startsWith("https://")
    ? url
    : resolveR2Url(url);
  const res = await fetch(absolute);
  if (!res.ok) throw new Error(`failed to fetch ${absolute}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function analyzePage(
  imageUrl: string,
  jobId: string,
  pageNumber: number,
  totalPages: number,
): Promise<unknown> {
  // Page position helps the LLM classify: page 1 is almost always the FRONT
  // cover, an early title/copyright page is an intro, the rest are interior.
  const positionNote =
    `CONTEXT: This is page ${pageNumber} of ${totalPages} in the source book. ` +
    `Page 1 is almost always the FRONT COVER; a title / copyright / dedication page near ` +
    `the front is an intro; all other pages are interior coloring pages. Use this ` +
    `position together with the image content to classify accurately.\n\n`;
  const extracted = await visionAnalyzeJSON<{
    scene?: unknown;
    environment?: unknown;
    characters?: unknown[];
    locations?: unknown[];
    props?: unknown[];
  }>(imageUrl, positionNote + CLONE_EXTRACTION_PROMPT, {
    maxTokens: 4000,
    temperature: 0.3,
    trace: { caller: "worker/analyze", entityType: "cloneJob", entityId: jobId },
  });
  // Page-type signals live on the same JSON but are read separately so the
  // reproduction object stays assignable to buildReproductionPrompt's input.
  const signals = extracted as { isCover?: boolean; isIntro?: boolean; isInterior?: boolean };
  const reproductionPrompt = buildReproductionPrompt(extracted);
  return {
    scene: extracted.scene ?? { description: "", cameraView: "wide", composition: "" },
    environment: extracted.environment ?? {
      timeOfDay: "day",
      weather: "sunny",
      season: "neutral",
      mood: "peaceful",
    },
    characters: extracted.characters ?? [],
    locations: extracted.locations ?? [],
    props: extracted.props ?? [],
    // Page-type signals — consumed by stepAnalyze's classifyPage pass so only
    // interior pages get redesigned (covers/intros are handled separately).
    isCover: signals.isCover === true,
    isIntro: signals.isIntro === true,
    isInterior: signals.isInterior === true,
    reproductionPrompt,
  };
}

async function generatePage(args: {
  prompt: string;                // kept for signature compat; ignored
  sourceImageUrl: string;
  pageNumber: number;
  jobId: string;
  changePercent?: number;        // optional; defaults to 30 to match manual reproduce
}): Promise<{ base64: string }> {
  const fullPrompt = buildRedesignPrompt(args.changePercent ?? 30);
  const src = resolveR2Url(args.sourceImageUrl);
  const trace = { caller: "worker/reproduce", entityType: "cloneJob", entityId: args.jobId };
  const pick = (img: { base64?: string; dataUrl?: string }) =>
    img.base64 || img.dataUrl?.split(",")[1] || "";
  try {
    // Primary: the configured IMAGE_PROVIDER (KingCong on prod).
    return { base64: pick(await editImage(src, fullPrompt, { trace })) };
  } catch (err) {
    // KingCong sometimes rejects a page ("invalid_generation" / content policy).
    // Fall back ONCE to LiteLLM with a FLUX model before the caller skips the
    // page — recovers most rejects without manual regen. Model is overridable
    // via LITELLM_FALLBACK_IMAGE_MODEL (default flux.2).
    const fallbackModel = process.env.LITELLM_FALLBACK_IMAGE_MODEL || "flux.2";
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    console.warn(
      `[generatePage] primary provider failed for page ${args.pageNumber} (${msg}); ` +
        `falling back to litellm/${fallbackModel}`,
    );
    const img = await editImage(src, fullPrompt, {
      provider: "litellm",
      model: fallbackModel,
      trace: { ...trace, caller: "worker/reproduce-fallback" },
    });
    return { base64: pick(img) };
  }
}

export const downloadDeps = { fetchPdf, uploadToR2 };
export const renderDeps = { readPdfFromR2, renderPdfToImages, uploadToR2 };
export const analyzeDeps = { analyzePage, resolveR2Url };
export const extractEntitiesDeps = {
  generateCharacterReference: (prompt: string, opts: { sourceImageUrl?: string; characterName: string; characterInfo?: string }) =>
    generateCharacterReference(prompt, {
      sourceImageUrl: opts.sourceImageUrl,
      characterName: opts.characterName,
      characterInfo: opts.characterInfo,
      trace: { caller: "worker/extract-entities", entityType: "character" },
    }),
  generateLocationReference: (prompt: string, opts: { sourceImageUrl?: string; locationName: string }) =>
    generateLocationReference(prompt, {
      sourceImageUrl: opts.sourceImageUrl,
      locationName: opts.locationName,
      trace: { caller: "worker/extract-entities", entityType: "location" },
    }),
  uploadToR2,
  randomUUID: () => crypto.randomUUID(),
};
export const reproduceDeps = { generatePage, uploadToR2, resolveR2Url };
export const fillInteriorDeps = {
  generatePage,
  uploadToR2,
  // Fisher–Yates in place; runtime-only (worker), so Math.random is fine here.
  shuffle: <T>(a: T[]): T[] => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
};
export const createBookDeps = { randomUUID: () => crypto.randomUUID(), copyImage };

async function fetchImage(url: string): Promise<{ body: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    // Attach the HTTP status so callers (stepOneShot) can distinguish
    // expired-signed-URL 4xx (recoverable via session recheck) from other
    // failures without parsing the message.
    const err = new Error(`failed to fetch ${url}: ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  const contentType = res.headers.get("content-type") || "image/png";
  const body = Buffer.from(await res.arrayBuffer());
  return { body, contentType };
}

export const oneShotDeps = {
  runOneShot: (pdfUrl: string, jobId: string, brandInfo?: string) =>
    cloneOneShot(pdfUrl, {
      brandInfo,
      trace: { caller: "worker/one-shot", entityType: "cloneJob", entityId: jobId },
    }),
  // Re-poll an existing Diaflow session to get FRESH signed URLs when the
  // cached ones expire mid-loop. No new one-shot API call — cheap ~1s poll.
  recheckOneShot: async (sessionId: string) => {
    const result = await recheckOneShotSession(sessionId);
    return { pages: result.pages };
  },
  fetchImage,
  uploadToR2,
  resolveR2Url,
};

// Re-exported from the shared @vx/server-core module (see import above) so
// existing worker imports of `generateCoverDeps` keep working unchanged.
export { generateCoverDeps };

// Full AI book-meta generation from the cover image (parity with the admin's
// /api/generate/book-meta). Injected into stepGenerateBookMeta.
export const generateBookMetaDeps = {
  resolveR2Url,
  generateBookMeta: async (
    coverImageUrl: string,
    categories: { id: string; displayName: string }[],
  ): Promise<BookMetaGenerationResult> => {
    const { systemPrompt, userPrompt } = buildBookMetaPrompt(categories);
    return visionAnalyzeJSON<BookMetaGenerationResult>(coverImageUrl, userPrompt, {
      systemPrompt,
      maxTokens: 4096,
      temperature: 0.7,
      trace: { caller: "clone/generate-book-meta", entityType: "book" },
    });
  },
};
