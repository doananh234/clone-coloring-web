import { generateCoverSource } from "../ai";
import { visionAnalyzeJSON } from "../ai/llm-provider";
import { COLORING_STYLE_EXTRACTION_PROMPT } from "../ai/prompts";
import {
  getR2Config,
  createR2Client,
  uploadToR2 as r2Upload,
  resolveR2Url,
} from "../r2";
import { generateAiCover } from "./generate-ai-cover";

/**
 * SHARED `GenerateCoverDeps` wiring for `stepGenerateCover` (@vx/clone-core).
 *
 * SINGLE SOURCE OF TRUTH for the dependency object that regenerates a book
 * cover: extract source-page coloring style → colorize + recompose the middle
 * page into a cover-source layout → AI cover typography → upload to R2.
 * Consumed by BOTH:
 *   - apps/worker (processor/step-deps.ts re-exports this)
 *   - apps/admin  (POST /api/clone/regenerate-covers backfill route)
 *
 * Keeping ONE copy means a prompt tweak, a colorize option, or an R2 wiring
 * fix propagates to the worker and the admin backfill without a two-file
 * sync burden.
 *
 * The object is structurally the `GenerateCoverDeps` interface exported from
 * `@vx/clone-core/steps`. It's intentionally NOT typed against that interface
 * here so `@vx/server-core` stays free of a `@vx/clone-core` import (clone-core
 * depends on server-core conceptually via injection, not the reverse). The
 * consuming side passes it straight into `stepGenerateCover(ctx, db, deps)`
 * where the compiler checks it structurally.
 */

// One R2 client per server / worker process — matches generate-ai-cover.ts and
// the worker's step-deps.ts module-level pattern.
const r2Config = getR2Config();
const r2Client = createR2Client(r2Config);

async function uploadToR2(args: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<{ url: string }> {
  return r2Upload({ client: r2Client, config: r2Config, ...args });
}

export const generateCoverDeps = {
  // Colorize + recompose the middle page into a text-free cover-source layout
  // (title-safe area up top, illustration in the lower band). Single combined
  // image-to-image call — no separate plain-colorized asset is produced.
  generateCoverSource: (
    imageUrl: string,
    directive: string,
    opts?: { referenceImageUrls?: string[] },
  ) => generateCoverSource(imageUrl, directive, opts),
  generateAiCover,
  // Extract the source page's coloring style (palette + directive) so the
  // cover keeps the original book's look — same prompt the admin's create-book
  // route uses. Returns raw parsed JSON.
  extractColoringStyle: (sourceImageUrl: string) =>
    visionAnalyzeJSON<Record<string, unknown>>(
      sourceImageUrl,
      COLORING_STYLE_EXTRACTION_PROMPT,
      { maxTokens: 20000, temperature: 0.3 },
    ),
  uploadToR2,
  resolveR2Url,
};
