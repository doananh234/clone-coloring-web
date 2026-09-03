import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@vx/db";
import { editImage } from "@vx/server-core/ai";
import { frameInstruction, pickDifferentCameraView } from "@vx/server-core/ai/prompts";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import { flushLangfuse } from "@vx/server-core/langfuse";
import type { BookColoringPage } from "@vx/coloring/data/additional-pages";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ bookId: string; pageId: string }> };

/**
 * Job-independent single-page regen. Redraws the page's CURRENT line-art (same
 * scene, or a new camera angle) via image-to-image and returns a PREVIEW
 * candidate uploaded to R2 — the book is NOT modified (the client applies the
 * chosen candidate separately).
 *
 * This is the fallback for books whose source clone job no longer exists
 * (/clone/[jobId]/reproduce 404s): "có job dùng job, không có job dùng ảnh hiện tại".
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId, pageId } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      newAngle?: boolean;
      provider?: string;
      artStyleId?: string;
      instructions?: string;
    };
    const newAngle = Boolean(body.newAngle);
    const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
    const provider =
      body.provider === "kingcong" || body.provider === "diaflow" || body.provider === "litellm" || body.provider === "azure"
        ? body.provider
        : undefined;

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const pages = (book.coloringPages as unknown as BookColoringPage[]) ?? [];
    const page = pages.find((p) => p.id === pageId);
    if (!page?.url) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    // Optional B&W art style to follow: its reference image(s) go in as SECONDARY
    // references (the current page stays PRIMARY so the scene is preserved) and
    // its directive is folded into the prompt.
    let styleDirective = "";
    let styleRefUrls: string[] = [];
    if (body.artStyleId) {
      const style = await prisma.artStyle.findUnique({
        where: { id: body.artStyleId },
        select: { referenceImages: true, generationDirective: true },
      });
      if (style) {
        styleDirective = style.generationDirective ?? "";
        const refs = (style.referenceImages as { url?: string }[] | null) ?? [];
        styleRefUrls = refs
          .map((r) => r?.url)
          .filter((u): u is string => Boolean(u))
          .slice(0, 2)
          .map((u) => resolveR2Url(u));
      }
    }

    const anchorUrl = resolveR2Url(page.url);
    // "Đổi góc" → force a SPECIFIC (different) camera view so the result is clearly
    // a new viewpoint, not a near-identical redraw. Random pick from the canonical
    // view list (we don't reliably know the page's current view here).
    const cameraView = newAngle ? pickDifferentCameraView(undefined) : undefined;
    const lineArt = "Clean black-and-white line art only (no color, no shading).";

    // When a style reference is attached, LABEL each image by its position so the
    // model never confuses the SOURCE page with the STYLE sample. Images are sent
    // in this order by editImage: [primary (page), ...references (style)].
    let prompt: string;
    if (styleRefUrls.length) {
      const n = 1 + styleRefUrls.length;
      const styleLabel = styleRefUrls.length > 1 ? `IMAGE 2-${n}` : "IMAGE 2";
      const task = cameraView
        ? `Redraw IMAGE 1 from a ${cameraView} CAMERA VIEW — the composition, framing and viewpoint MUST change SIGNIFICANTLY to fit this new angle (do NOT keep the original camera position). Keep the same characters, objects and scene, only the viewpoint changes`
        : `Redraw IMAGE 1 keeping the SAME scene, composition and camera angle`;
      prompt =
        `You are given ${n} images IN THIS EXACT ORDER:\n` +
        `- IMAGE 1 = SOURCE PAGE: the coloring page to redraw. Keep its scene, characters and objects.\n` +
        `- ${styleLabel} = STYLE REFERENCE(S): black-and-white line-art sample(s). Copy ONLY their drawing STYLE (stroke weight, curve treatment, spacing, motif treatment). Do NOT copy their subject, scene or content.\n\n` +
        `TASK: ${task}, in the black-and-white line-art style of ${styleLabel}. ${lineArt} ` +
        `STRICT: Do NOT redraw, reproduce or borrow the CONTENT of ${styleLabel} — take its STYLE only.` +
        (styleDirective ? `\n\nStyle directive (applies to the STYLE of ${styleLabel} only):\n${styleDirective}` : "");
      const frame = frameInstruction();
      if (frame) prompt += `\n\n${frame}`;
    } else {
      // No style chosen → KEEP the page's OWN original line-art style. We must NOT
      // use buildRedesignPrompt here: its "~30% refreshed variation" lets the model
      // drift the drawing style (stroke weight / technique), which reads as "đổi nét
      // vẽ" even though no B&W reference was picked. Instead redraw faithfully and
      // hard-lock the original style — only the camera angle may change on "đổi góc".
      const task = cameraView
        ? `Redraw this black-and-white coloring page from a ${cameraView} CAMERA VIEW — the composition, framing and viewpoint MUST change SIGNIFICANTLY to fit this new angle (do NOT keep the original camera position). Keep the SAME characters, objects and scene, only the viewpoint changes`
        : `Redraw this black-and-white coloring page keeping the SAME scene, composition, characters, objects and camera angle`;
      prompt =
        `${task}. ` +
        `CRITICAL — PRESERVE THE ORIGINAL LINE-ART STYLE: keep the EXACT same stroke weight, line thickness, curve treatment and drawing technique as the source image. Do NOT restyle, do NOT redesign, do NOT change the artistic style. ${lineArt} ` +
        `Output must be 1 single frame, not a split panel or grid layout.`;
      const frame = frameInstruction();
      if (frame) prompt += `\n\n${frame}`;
    }

    // User-typed edits from the Regen modal (e.g. "remove the hat", "change the
    // background to a garden") — applied on top of the redraw, highest priority.
    if (instructions) {
      prompt += `\n\nUSER-REQUESTED CHANGES (apply these exactly to the redrawn page, they take priority): ${instructions}`;
    }

    const img = await editImage(anchorUrl, prompt, {
      provider,
      referenceImageUrls: styleRefUrls.length ? styleRefUrls : undefined,
      trace: { caller: "books/page-regen", entityType: "book", entityId: bookId },
    });
    const base64 = img.base64 || img.dataUrl?.split(",")[1] || "";
    if (!base64) throw new Error("editImage returned no image data");

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const key = `assets/${bookId}/pages/${pageId}-regen-${crypto.randomUUID()}.png`;
    const { url } = await uploadToR2({
      client: r2Client,
      config: r2Config,
      key,
      body: Buffer.from(base64, "base64"),
      contentType: "image/png",
    });

    await flushLangfuse();
    return NextResponse.json({ success: true, url, cameraView });
  } catch (error) {
    console.error("[books/page-regen POST] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
