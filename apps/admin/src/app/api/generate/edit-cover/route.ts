import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { editImage } from "@vx/server-core/ai/image-provider";

/**
 * Edit an existing book cover with a user-provided instruction.
 *
 * DESIGN:
 *   The cover is the ONLY image we send to the model. Even when a coloring style
 *   is picked we deliberately DO NOT attach the style's reference images —
 *   those are full illustrations, and passing them alongside the (also fully
 *   illustrated) cover reliably confuses the model into replacing the cover
 *   with reference content. Instead we describe the style purely in TEXT
 *   (technique, mood, hex palette, directive), which is unambiguous.
 *
 *   Colorize-preview can safely pass reference images because its source is
 *   B&W line art — an edit-cover source is not, so the same trick backfires.
 *
 * Distinct from `/api/generate/text-overlay-blend` (which blends header/footer
 * text into the art style — a different job entirely).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageUrl, userPrompt, coloringStyleId } = body as {
      imageUrl: string;
      userPrompt: string;
      coloringStyleId?: string | null;
    };

    if (!imageUrl || !userPrompt?.trim()) {
      return NextResponse.json(
        { error: "imageUrl and userPrompt are required" },
        { status: 400 },
      );
    }

    let styleContext: StyleContext | null = null;

    if (coloringStyleId) {
      const style = await prisma.coloringStyle.findUnique({ where: { id: coloringStyleId } });
      if (!style) {
        return NextResponse.json({ error: "Coloring style not found" }, { status: 404 });
      }
      styleContext = extractStyleContext(style);
    }

    const systemPrompt = buildEditCoverPrompt(userPrompt.trim(), styleContext);

    // Deliberately no referenceImageUrls — see file header comment.
    const img = await editImage(imageUrl, systemPrompt);

    return NextResponse.json({
      success: true,
      previewUrl: img.dataUrl,
      base64: img.base64,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

interface StyleContext {
  name: string;
  technique: string | null;
  mood: string | null;
  primaryColors: string[];
  directive: string | null;
}

function extractStyleContext(style: {
  name: string;
  medium: unknown;
  colorPalette: unknown;
  overallFeel: unknown;
  colorizationDirective: string | null;
}): StyleContext {
  const medium = (style.medium as { technique?: string } | null) || null;
  const palette = (style.colorPalette as { primaryColors?: string[] } | null) || null;
  const feel = (style.overallFeel as { mood?: string } | null) || null;
  return {
    name: style.name,
    technique: medium?.technique?.trim() || null,
    mood: feel?.mood?.trim() || null,
    primaryColors: (palette?.primaryColors || []).filter((c) => typeof c === "string" && c.trim()),
    directive: style.colorizationDirective?.trim() || null,
  };
}

/**
 * Preservation-first cover edit prompt.
 *
 * Contract with the model:
 *   1. The ONE input image is the cover; keep it intact except where the user
 *      or the color style directs a change.
 *   2. Apply the specific user request only.
 *   3. If a color style is provided (text-only description), let it steer the
 *      palette/technique of the CHANGED regions — never a global recolor.
 *   4. Strip any border/frame unconditionally.
 */
function buildEditCoverPrompt(userRequest: string, style: StyleContext | null): string {
  const sections: string[] = [
    "You are a professional book-cover retoucher. Your job is to make a SMALL, TARGETED EDIT to the provided cover image — not to redesign it or replace it.",
    "",
    "==================================================",
    "SOURCE IMAGE",
    "==================================================",
    "",
    "The provided image is THE COVER. It is the sole source of visual content. Preserve its illustration, characters, background, composition, art style, and every text element EXACTLY, except where the user request below explicitly asks for a change.",
    "",
    "==================================================",
    "USER EDIT REQUEST",
    "==================================================",
    "",
    `"${userRequest}"`,
    "",
    "Apply ONLY this specific change. Everything not mentioned in the request must remain visually identical to the provided cover.",
  ];

  if (style) {
    sections.push(
      "",
      "==================================================",
      `COLOR STYLE GUIDANCE — ${style.name}`,
      "==================================================",
      "",
      "The following is a TEXT description of a color style. No style reference image is provided; use only this text to guide palette and technique choices for the CHANGED regions.",
    );

    if (style.technique) sections.push("", `- Medium / technique: ${style.technique}`);
    if (style.mood) sections.push(`- Overall mood: ${style.mood}`);
    if (style.primaryColors.length > 0) {
      sections.push(`- Primary palette (hex): ${style.primaryColors.join(", ")}`);
    }
    if (style.directive) {
      sections.push("", "Style directive:", style.directive);
    }

    sections.push(
      "",
      "SCOPE OF THIS STYLE:",
      "- Apply it ONLY to the elements the user asked to change (e.g. new text color, replaced object).",
      "- DO NOT globally recolor, re-render, or restyle the untouched parts of the cover.",
      "- If the user's request is text-only (e.g. changing a brand name), keep the illustration untouched and only let the style influence how the new text is rendered.",
    );
  }

  sections.push(
    "",
    "==================================================",
    "COVER PRESERVATION RULES",
    "==================================================",
    "",
    "MANDATORY (unless the user explicitly asked otherwise):",
    "- Preserve the original illustration, characters, objects, and background EXACTLY.",
    "- Preserve the exact composition, positions, and proportions of every element.",
    "- Preserve every text element the user did NOT ask to change (title, subtitle, brand, byline, badges) — same font, weight, size, position, color, outline, shadow, letter spacing, and spelling.",
    "- Preserve the aspect ratio and resolution.",
    "- Do NOT redesign, restyle, recompose, reorganize, or regenerate.",
    "- Do NOT add watermarks, logos, stickers, decorative elements, or extra text.",
    "- Do NOT introduce new characters, objects, or scenery.",
    "",
    "==================================================",
    "TEXT EDIT RULES",
    "==================================================",
    "",
    "- If the user asks to change a specific word or brand (e.g. \"change Acme to Zenith\"), replace ONLY that word.",
    "- Match the original font, weight, color, outline, shadow, and letter spacing exactly so the swap is visually seamless.",
    "- Keep the exact spelling of every preserved text element.",
    "- Do NOT alter the position or size of untouched text.",
    "",
    "==================================================",
    "BORDER REMOVAL RULE (UNCONDITIONAL)",
    "==================================================",
    "",
    "- If the cover has ANY border, frame, outline, decorative edge, or background margin around the illustration, REMOVE it completely. The final cover must be full-bleed: illustration extends edge-to-edge with no padding on any side.",
    "- If the original has no border, do not add one.",
    "- This rule applies even if the user did not mention borders.",
    "",
    "==================================================",
    "SUCCESS CRITERIA",
    "==================================================",
    "",
    "A viewer comparing the result to the original cover should see:",
    "- The specific requested edit applied.",
    "- Any border stripped away (full-bleed).",
    "- Everything else — illustration, characters, background, composition, untouched text — visually identical to the original.",
  );

  return sections.join("\n");
}
