import { prisma } from "@vx/db";
import { buildColoringStyleRowInput } from "@vx/clone-core/steps";
import { visionAnalyzeJSON } from "@vx/server-core/ai/llm-provider";
import { COLORING_STYLE_EXTRACTION_PROMPT } from "@vx/server-core/ai/prompts";
import { resolveR2Url } from "@vx/server-core/r2";
import { FONT_CATALOG } from "@vx/server-core/text-overlay";
import {
  buildCoverDesignPrompt,
  type CoverDesignPack,
  type CoverDesignContext,
} from "@vx/server-core/ai/prompts/cover-design-prompt";

export interface SourceStyleResult {
  /** Coloring style row created from the source cover's palette + directive. */
  coloringStyleId: string | null;
  /** Cover text-style pack (fonts/palettes/layout for title/subtitle/brand). */
  coverStylePack: CoverDesignPack | null;
}

/**
 * Extract BOTH the coloring style and the cover text-style from a clone job's
 * first colored image (the source cover). Runs at create-book time so every
 * cloned book keeps the source's look. Best-effort: each half is wrapped so a
 * failure never blocks book creation — returns whatever succeeded.
 */
export async function extractSourceStyleFromCover(opts: {
  coverImageUrl: string;
  context: CoverDesignContext;
}): Promise<SourceStyleResult> {
  const { coverImageUrl, context } = opts;
  const src = resolveR2Url((coverImageUrl || "").split("?")[0]);
  const out: SourceStyleResult = { coloringStyleId: null, coverStylePack: null };
  if (!src) return out;

  // 1. Coloring style (palette + colorization directive) from the colored cover.
  try {
    const parsed = await visionAnalyzeJSON<Record<string, unknown>>(
      src,
      COLORING_STYLE_EXTRACTION_PROMPT,
      { maxTokens: 20000, temperature: 0.3 },
    );
    const created = await prisma.coloringStyle.create({
      data: buildColoringStyleRowInput(parsed, {
        referenceUrl: coverImageUrl,
        fallbackName: `${context.title} — style bìa gốc`,
      }),
    });
    out.coloringStyleId = created.id;
  } catch (error) {
    console.error("[extract-source-style] coloring style failed:", error);
  }

  // 2. Cover text-style pack (fonts/palettes/layout) from the same cover.
  try {
    const fontChoices = FONT_CATALOG.map((f) => f.family);
    const { systemPrompt, userPrompt } = buildCoverDesignPrompt(context, fontChoices);
    out.coverStylePack = await visionAnalyzeJSON<CoverDesignPack>(
      src,
      `${systemPrompt}\n\n${userPrompt}`,
      { maxTokens: 2000, temperature: 0.4 },
    );
  } catch (error) {
    console.error("[extract-source-style] cover design failed:", error);
  }

  return out;
}
