import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@vx/db";
import { editImage, generateColoringPage, generateCharacterReference, textPrompt, visionAnalyzeJSON } from "@vx/server-core/ai";
import { buildRedesignPrompt } from "@vx/server-core/ai/prompts";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import { flushLangfuse } from "@vx/server-core/langfuse";
import { additionalParentNumber, buildAdditionalPage, type BookColoringPage } from "@vx/coloring/data/additional-pages";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ bookId: string; pageId: string }> };

// Deterministic scene bank — coloring-book-safe setting × activity × mood combos.
// Used instead of LLM-authored scene batches: the saigon text model is a reasoning
// model that leaks its scratchpad ("-> Different", "Prev N:") instead of clean
// scenes, so batches are unusable. Combining these banks by index gives clean,
// diverse, non-repeating scenes with zero LLM dependency; character identity still
// comes from the extracted description + reference sheet passed to the image model.
const SCENE_SETTINGS = [
  "a sunny flower garden", "a sandy beach by gentle waves", "a cozy autumn forest",
  "a warm country kitchen", "a snug bedroom with a big window", "a quiet library nook",
  "a leafy city park", "a snowy village square", "a glass greenhouse full of plants",
  "a wooden treehouse", "a breezy wildflower meadow", "a little corner bakery",
  "a bright art studio", "a lakeside campsite", "a riverbank among the reeds",
  "a mountain picnic spot", "a cozy cafe on a rainy day", "a cheerful playground",
  "a small farm with a red barn", "a seaside lighthouse path",
];
const SCENE_ACTIVITIES = [
  "reading a picture book", "baking a tray of cookies", "watering potted flowers",
  "flying a colorful kite", "painting at a little easel", "building a sandcastle",
  "having a picnic with friends", "strumming a small guitar", "riding a bicycle",
  "decorating a cake", "gazing up at the stars", "chasing soap bubbles",
  "feeding a few little birds", "arranging a bouquet", "sipping cocoa by a window",
  "planting seeds in tiny pots", "folding paper boats", "stacking books into a fort",
  "cuddling a fluffy rabbit", "blowing dandelion seeds",
];
const SCENE_MOODS = [
  "On a bright sunny morning", "On a golden autumn afternoon", "On a soft snowy day",
  "Under a calm starry evening", "On a breezy spring day", "During a gentle summer shower",
  "At a warm sunset", "On a cozy rainy afternoon",
];

/** Build a clean, diverse scene string for the nth additional page. */
function buildScene(n: number): string {
  const setting = SCENE_SETTINGS[n % SCENE_SETTINGS.length];
  const activity = SCENE_ACTIVITIES[(n * 7 + 3) % SCENE_ACTIVITIES.length];
  const mood = SCENE_MOODS[(n * 3 + 1) % SCENE_MOODS.length];
  return `${mood}, the character is ${activity} in ${setting}, with charming background details to color.`;
}

/**
 * Regen Thêm: generate `count` NEW additional interior pages from one source
 * page and append them to book.coloringPages (origin:"additional"). Replaces the
 * old per-page variant flow — these are full interior pages (counted/exported/PDF).
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId, pageId } = await params;
    const body = (await req.json().catch(() => ({}))) as { count?: number; source?: "A" | "B" | "story" | "character"; changePercent?: number; provider?: string };
    const count = Math.min(8, Math.max(1, body.count ?? 1));
    const source: "A" | "B" | "story" | "character" =
      body.source === "B" ? "B" : body.source === "story" ? "story" : body.source === "character" ? "character" : "A";
    const pct = Math.min(95, Math.max(5, body.changePercent ?? 30));
    const provider =
      body.provider === "kingcong" || body.provider === "diaflow" || body.provider === "litellm" || body.provider === "azure"
        ? body.provider
        : undefined;

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    const pages = (book.coloringPages as unknown as BookColoringPage[]) ?? [];
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    const src = pages[idx];
    const parentPageNumber = additionalParentNumber(src, idx);
    const anchorUrl = resolveR2Url(src.url);

    // --- STORY mode: keep the SAME characters + style (anchor = the original page)
    // but advance the STORY per page. The story is chained in TEXT only (LLM
    // continues the scene from the previous one), while every image is drawn with
    // the ORIGINAL page as the identity/style reference — so nothing drifts. ---
    if (source === "story") {
      const bookData = (book.data as Record<string, unknown> | null | undefined) ?? {};
      const artStyleId = typeof bookData.artStyleId === "string" ? bookData.artStyleId : undefined;
      let styleDirective = "";
      let styleRefUrls: string[] = [];
      if (artStyleId) {
        const style = await prisma.artStyle.findUnique({
          where: { id: artStyleId },
          select: { generationDirective: true, referenceImages: true },
        });
        if (style) {
          styleDirective = style.generationDirective ?? "";
          styleRefUrls = ((style.referenceImages as { url?: string }[] | null) ?? [])
            .map((r) => r?.url)
            .filter((u): u is string => Boolean(u))
            .slice(0, 2)
            .map((u) => resolveR2Url(u));
        }
      }
      const bookTitle = book.title || "Coloring Book";
      let currentScene =
        (typeof src.prompt === "string" && src.prompt.trim()) ||
        `A cute character in a cozy scene from "${bookTitle}".`;

      const r2Config = getR2Config();
      const r2Client = createR2Client(r2Config);
      const created: BookColoringPage[] = [];
      for (let k = 0; k < count; k++) {
        // 1. Chain the STORY (text only) — next scene continues from the previous.
        const nextScene = (
          await textPrompt(
            `You are writing a gentle children's coloring-book picture story titled "${bookTitle}". ` +
              `The current scene is:\n"${currentScene}"\n\n` +
              `Write the NEXT scene: keep the SAME main character(s) and story world, continue naturally to a NEW moment / activity / place. ` +
              `2-3 short, concrete, VISUAL sentences (what is happening, where). No words or letters in the picture. Return ONLY the scene description, no quotes.`,
            { maxTokens: 300, temperature: 0.9 },
          )
        ).trim();
        // 2. Draw it — anchor characters + style to the ORIGINAL page (identity
        //    reference) so nothing drifts across the chain. The reference is a FULL
        //    page, so we must explicitly force a NEW scene or the model reproduces
        //    the original setting.
        const scenePrompt =
          `${nextScene}\n\n` +
          `IMPORTANT — SCENE CHANGE: Draw a COMPLETELY NEW scene, setting and background exactly as described above. ` +
          `The reference image is ONLY for the MAIN CHARACTER's look (same species, face, body, outfit, line-art style). ` +
          `Do NOT copy the reference's room, furniture, props, layout or background — invent a fresh, different setting that fits the new scene.`;
        const img = await generateColoringPage(scenePrompt, {
          provider,
          characterReferenceImageUrls: [anchorUrl],
          artStyle:
            styleDirective || styleRefUrls.length
              ? { generationDirective: styleDirective, referenceImageUrls: styleRefUrls }
              : undefined,
          trace: { caller: "books/page-additional-story", entityType: "book", entityId: bookId },
        });
        const base64 = img.base64 || img.dataUrl?.split(",")[1] || "";
        if (!base64) throw new Error("generateColoringPage returned no image data");
        const newId = crypto.randomUUID();
        const key = `assets/${bookId}/pages/${newId}.png`;
        const { url } = await uploadToR2({
          client: r2Client,
          config: r2Config,
          key,
          body: Buffer.from(base64, "base64"),
          contentType: "image/png",
        });
        created.push(buildAdditionalPage({ id: newId, url, parentPageNumber, prompt: nextScene }));
        currentScene = nextScene; // chain the story forward
      }
      const updated = [...pages, ...created];
      await prisma.book.update({ where: { id: bookId }, data: { coloringPages: updated as never } });
      await flushLangfuse();
      return NextResponse.json({ success: true, added: created.length });
    }

    // --- CHARACTER mode: EXTRACT the book's recurring main character (once, cached
    // on book.data) as a CLEAN character sheet on a plain background, then invent a
    // BATCH of diverse, independent scenes and redraw the character into each. The
    // reference is the character sheet — NOT a full old page — so nothing sticks to
    // the previous story or composition, and the batch is deduped against pages that
    // already exist. This is the fill-to-target default. ---
    if (source === "character") {
      const bookData = (book.data as Record<string, unknown> | null | undefined) ?? {};
      const bookTitle = book.title || "Coloring Book";

      // Art style (same loader as story mode).
      const artStyleId = typeof bookData.artStyleId === "string" ? bookData.artStyleId : undefined;
      let styleDirective = "";
      let styleRefUrls: string[] = [];
      if (artStyleId) {
        const style = await prisma.artStyle.findUnique({
          where: { id: artStyleId },
          select: { generationDirective: true, referenceImages: true },
        });
        if (style) {
          styleDirective = style.generationDirective ?? "";
          styleRefUrls = ((style.referenceImages as { url?: string }[] | null) ?? [])
            .map((r) => r?.url)
            .filter((u): u is string => Boolean(u))
            .slice(0, 2)
            .map((u) => resolveR2Url(u));
        }
      }

      const originals = pages.filter((p) => p.origin !== "additional");
      const pool = originals.length ? originals : pages;
      const sampleUrls = pool.slice(0, 3).map((p) => resolveR2Url(p.url));
      const srcUrl = resolveR2Url(src.url);

      // 1. Extract the character's fixed identity (vision), cached on book.data.
      //    Best-effort: the saigon vision path intermittently fails to fetch remote
      //    image URLs (Vertex deadline) — on any failure we degrade to using the
      //    source page directly as the reference (below), never hard-failing.
      let characterDesc = typeof bookData.fillCharacterDesc === "string" ? bookData.fillCharacterDesc : "";
      if (!characterDesc && sampleUrls.length) {
        try {
          const ext = await visionAnalyzeJSON<{ character?: string }>(
            sampleUrls[0], // single image → less remote-fetch load, fewer deadline rejects
            `This is an interior page of a children's coloring book titled "${bookTitle}". ` +
              `Identify the SINGLE recurring MAIN CHARACTER. Describe ONLY its FIXED identity for redrawing it in brand-new scenes: ` +
              `species/type, face, body shape, distinctive features, clothing/accessories, and the black-and-white line-art style. ` +
              `Ignore all backgrounds, props and activities. Return JSON: {"character":"<one detailed paragraph>"}`,
            { maxTokens: 400 },
          );
          characterDesc = (ext?.character || "").trim();
        } catch (e) {
          console.warn("[page-additional-character] extract failed, using source page as ref:", e instanceof Error ? e.message : e);
        }
      }

      const r2Config = getR2Config();
      const r2Client = createR2Client(r2Config);

      // 2. Build a CLEAN character reference sheet (plain background), cached on book.data.
      //    Also best-effort — if it fails we fall back to the source page as reference.
      let charRefUrl = typeof bookData.fillCharacterRefUrl === "string" ? bookData.fillCharacterRefUrl : "";
      if (!charRefUrl && characterDesc && sampleUrls.length) {
        try {
          const refImg = await generateCharacterReference(characterDesc, {
            sourceImageUrl: sampleUrls[0],
            provider,
          });
          const rb64 = refImg.base64 || refImg.dataUrl?.split(",")[1] || "";
          if (rb64) {
            const rid = crypto.randomUUID();
            const rkey = `assets/${bookId}/characters/${rid}.png`;
            const up = await uploadToR2({
              client: r2Client,
              config: r2Config,
              key: rkey,
              body: Buffer.from(rb64, "base64"),
              contentType: "image/png",
            });
            charRefUrl = up.url;
          }
        } catch (e) {
          console.warn("[page-additional-character] char-sheet gen failed, using source page as ref:", e instanceof Error ? e.message : e);
        }
      }
      // Reference for image generation: the clean char sheet if we have one, else the
      // source page (still the right character, just with its old background attached —
      // the scene-change instruction below forces a fresh setting).
      const refForGen = charRefUrl ? resolveR2Url(charRefUrl) : srcUrl;
      const usingCleanSheet = Boolean(charRefUrl);
      if (!refForGen) return NextResponse.json({ error: "No source page to reference" }, { status: 400 });

      // 3. Build `count` DIVERSE, always-clean scenes from the deterministic bank,
      //    advancing past however many additional pages already exist so repeated
      //    calls keep producing new setting/activity combinations.
      const charForScenes = characterDesc || `the main character of "${bookTitle}"`;
      const startIdx = pages.filter((p) => p.origin === "additional").length;
      const scenes = Array.from({ length: count }, (_, k) => buildScene(startIdx + k));

      const refNote = usingCleanSheet
        ? `The reference image shows ONLY the main character's identity (look, outfit, line-art style) on a plain background.`
        : `The reference image shows the main character (use it ONLY for the character's look, outfit and line-art style). IGNORE its background, room, props and layout entirely.`;
      const created: BookColoringPage[] = [];
      for (const scene of scenes) {
        const scenePrompt =
          `${scene}\n\nCHARACTER (keep identical): ${charForScenes}\n\n` +
          `IMPORTANT: ${refNote} ` +
          `Redraw this SAME character performing the NEW scene above, and INVENT a fresh, different background/setting for it. ` +
          `Do NOT reuse any previous page's layout, room or props.`;
        const img = await generateColoringPage(scenePrompt, {
          provider,
          characterReferenceImageUrls: [refForGen],
          artStyle:
            styleDirective || styleRefUrls.length
              ? { generationDirective: styleDirective, referenceImageUrls: styleRefUrls }
              : undefined,
          trace: { caller: "books/page-additional-character", entityType: "book", entityId: bookId },
        });
        const base64 = img.base64 || img.dataUrl?.split(",")[1] || "";
        if (!base64) throw new Error("generateColoringPage returned no image data");
        const newId = crypto.randomUUID();
        const key = `assets/${bookId}/pages/${newId}.png`;
        const { url } = await uploadToR2({
          client: r2Client,
          config: r2Config,
          key,
          body: Buffer.from(base64, "base64"),
          contentType: "image/png",
        });
        created.push(buildAdditionalPage({ id: newId, url, parentPageNumber, prompt: scene }));
      }

      const newData = {
        ...bookData,
        ...(characterDesc ? { fillCharacterDesc: characterDesc } : {}),
        ...(charRefUrl ? { fillCharacterRefUrl: charRefUrl } : {}),
      };
      const updated = [...pages, ...created];
      await prisma.book.update({
        where: { id: bookId },
        data: { coloringPages: updated as never, data: newData as never },
      });
      await flushLangfuse();
      return NextResponse.json({ success: true, added: created.length });
    }

    const originalPrompt = typeof src.prompt === "string" ? src.prompt.trim() : "";
    const useB = source === "B" && originalPrompt.length > 0;
    const prompt = useB
      ? `${buildRedesignPrompt(pct)}\n\nORIGINAL SCENE DESCRIPTION (keep faithful to this):\n${originalPrompt}`
      : buildRedesignPrompt(pct);

    const r2Config = getR2Config();
    const r2Client = createR2Client(r2Config);
    const created: BookColoringPage[] = [];
    for (let k = 0; k < count; k++) {
      const img = await editImage(anchorUrl, prompt, {
        provider,
        trace: { caller: "books/page-additional", entityType: "book", entityId: bookId },
      });
      const base64 = img.base64 || img.dataUrl?.split(",")[1] || "";
      if (!base64) throw new Error("editImage returned no image data");
      const newId = crypto.randomUUID();
      const key = `assets/${bookId}/pages/${newId}.png`;
      const { url } = await uploadToR2({ client: r2Client, config: r2Config, key, body: Buffer.from(base64, "base64"), contentType: "image/png" });
      created.push(buildAdditionalPage({ id: newId, url, parentPageNumber, ...(useB ? { prompt: originalPrompt } : {}) }));
    }

    const updated = [...pages, ...created];
    await prisma.book.update({ where: { id: bookId }, data: { coloringPages: updated as never } });
    await flushLangfuse();
    return NextResponse.json({ success: true, added: created.length });
  } catch (error) {
    console.error("[books/page-additional POST] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
