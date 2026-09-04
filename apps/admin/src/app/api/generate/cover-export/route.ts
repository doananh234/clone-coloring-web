import { NextRequest, NextResponse } from "next/server";
import { getR2Config, createR2Client, uploadToR2 } from "@vx/server-core/r2";
import { prisma } from "@vx/db";
import { enqueueGenerationJob } from "@/lib/queue/generation-queue";
import { withQueueTimeout, isQueueTimeout, queueUnavailableResponse } from "@/lib/queue/queue-timeout";

interface RequestBody {
  bookId?: string;
  /**
   * Client-rendered cover as a base64 PNG (or a `data:image/png;base64,...`
   * data URL). WYSIWYG-preferred path: the client Fabric canvas exports
   * exactly what the user sees on screen, no server-side font loading.
   */
  imageBase64?: string;
  /**
   * AI-typography mode input: URL of the CLEAN colored illustration (no text).
   * When aiBlend=true, delegates to the shared generateAiCover module.
   */
  backgroundImageUrl?: string;
  aiBlend?: boolean;
  /** Required when aiBlend=true. Verbatim brand line to appear at the bottom. */
  brandName?: string;
  /**
   * Optional image model override (LiteLLM model id, e.g. "gpt-image-2"). Only
   * used when aiBlend=true. Empty → provider default (LITELLM_IMAGE_MODEL).
   */
  model?: string;
}

const r2Config = getR2Config();
const r2Client = createR2Client(r2Config);

function stripDataUrlPrefix(input: string): string {
  const idx = input.indexOf(",");
  if (input.startsWith("data:") && idx !== -1) return input.slice(idx + 1);
  return input;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;
    const { bookId, imageBase64, backgroundImageUrl, aiBlend, brandName, model } = body;

    if (!bookId) {
      return NextResponse.json({ error: "bookId is required" }, { status: 400 });
    }

    if (aiBlend) {
      if (!backgroundImageUrl) {
        return NextResponse.json(
          { error: "backgroundImageUrl is required when aiBlend=true" },
          { status: 400 },
        );
      }
    } else if (!imageBase64) {
      return NextResponse.json(
        { error: "imageBase64 is required when aiBlend is not set" },
        { status: 400 },
      );
    }

    const book = await prisma.book.findUnique({ where: { id: bookId }, select: { id: true } });
    if (!book) {
      return NextResponse.json({ error: `Book ${bookId} not found` }, { status: 404 });
    }

    // AI mode is now ASYNC: generateAiCover runs a KingCong ~150s image call that
    // blew past Cloudflare's ~100s HTTP timeout (error 524). Enqueue a background
    // GenerationJob (type "ai-cover") — the worker calls the same shared
    // generateAiCover (same prompt, R2 key, cache-bust) and the frontend polls
    // GET /api/generation-jobs for the resultUrl.
    if (aiBlend) {
      const job = await prisma.generationJob.create({
        data: {
          type: "ai-cover",
          status: "pending",
          bookId,
          bookTitle: brandName?.trim() || bookId,
          payload: {
            bookId,
            backgroundImageUrl: backgroundImageUrl as string,
            brandName: brandName ?? "",
            model: typeof model === "string" && model.trim() ? model.trim() : undefined,
          },
        },
      });

      try {
        await withQueueTimeout(enqueueGenerationJob(job.id));
      } catch (err) {
        if (isQueueTimeout(err)) return queueUnavailableResponse({ jobId: job.id, bookId });
        throw err;
      }

      return NextResponse.json({ success: true, jobId: job.id, bookId, status: "pending" });
    }

    // CLIENT-RENDERED mode: decode base64 → upload directly. WYSIWYG match
    // to the on-screen Fabric canvas; no scene rebuild, no font fetching.
    const pngBuffer = Buffer.from(stripDataUrlPrefix(imageBase64 as string), "base64");
    const key = `assets/books/${bookId}/cover.png`;
    const { url } = await uploadToR2({
      client: r2Client,
      config: r2Config,
      key,
      body: pngBuffer,
      contentType: "image/png",
    });
    const bustedUrl = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
    return NextResponse.json({
      url: bustedUrl,
      base64: pngBuffer.toString("base64"),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
