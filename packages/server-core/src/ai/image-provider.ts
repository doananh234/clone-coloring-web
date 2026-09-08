/**
 * Image Provider — unified facade for image generation and editing.
 *
 * Delegates to Azure OpenAI, Google Gemini, Vertex AI, Diaflow, KingCong, or LiteLLM based on IMAGE_PROVIDER env var.
 * Default: "azure". e.g. IMAGE_PROVIDER=diaflow | kingcong | litellm.
 *
 * All callers import from this file — never from provider-specific files.
 */

import { createRequire } from "node:module";

// ESM shim — `@vx/server-core` is "type": "module" so the bare `require()`
// used below to lazy-load provider modules needs a CJS-compatible require.
const require = createRequire(import.meta.url);

import type {
  ImageProviderInterface,
  ImageGenerationOptions,
  GeneratedImage,
  ColorizeOptions,
} from "./image-provider-types";
import { normalizeGeneratedImage } from "./normalize-image";
import { buildCharacterExtractionPrompt } from "./prompts/character-extraction-prompt";
import { buildLocationExtractionPrompt } from "./prompts/location-extraction-prompt";
import {
  buildCategoryIconPrompt,
  buildColoringPageGenerationPrompt,
} from "./prompts/page-generation-prompts";

// Re-export types so callers don't need to import from types file
export type { ImageGenerationOptions, GeneratedImage, ColorizeOptions };

/**
 * True when the active image provider caps prompt length (KingCong: 4000 chars).
 * The long cover/colorize prompts (6k–28k) must use their compact variants for
 * this provider — tail-truncation would drop most of the instructions.
 */
function resolveProviderName(override?: string): string {
  return (override || process.env.IMAGE_PROVIDER || "azure").toLowerCase();
}

export function usesCompactPrompts(override?: string): boolean {
  return resolveProviderName(override) === "kingcong";
}

function getProvider(override?: string): ImageProviderInterface {
  const provider = resolveProviderName(override);

  if (provider === "diaflow") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./image-provider-diaflow").diaflowImageProvider;
  }

  if (provider === "kingcong") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./image-provider-kingcong").kingcongImageProvider;
  }

  if (provider === "litellm") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./image-provider-litellm").litellmImageProvider;
  }

  if (provider === "gemini-web") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./image-provider-gemini-web").geminiWebImageProvider;
  }

  if (provider === "vertex") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./image-provider-vertex").vertexImageProvider;
  }

  if (provider === "gemini") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./image-provider-gemini").geminiImageProvider;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./image-provider-azure").azureImageProvider;
}

/**
 * Ordered provider chain for ONE image op: the resolved primary first, then the
 * configured fallbacks. On a provider error we advance to the next so a single
 * provider hiccup (KingCong "invalid_generation" / content policy, Diaflow 429,
 * etc.) never fails the whole page — the image just gets produced by the next
 * backend. Configure the fallbacks with IMAGE_FALLBACK_PROVIDERS (csv, default
 * "diaflow,azure"; "azure" = gpt-image-2). Set it empty for strict single-provider.
 */
function providerChain(override?: string): string[] {
  const primary = resolveProviderName(override);
  const fallbacks = (process.env.IMAGE_FALLBACK_PROVIDERS ?? "diaflow,azure")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

// --- Provider circuit breaker -------------------------------------------------
// A provider that keeps failing (e.g. KingCong timing out for 600s while its
// backend is down) would otherwise be tried FIRST on every request, burning the
// whole Cloudflare ~100s budget before the fallback runs — surfacing as 524.
// The breaker tracks consecutive failures per provider; once a provider trips it
// is DEPRIORITIZED to the back of the chain for a cooldown window so healthy
// fallbacks run first. It is never fully removed (still tried as last resort),
// and any success closes it again (half-open recovery after the cooldown).
// Per-process, in-memory (module state persists across requests in the long-
// running Next.js/worker node server). Tune via env:
//   IMAGE_BREAKER_THRESHOLD    consecutive failures to trip (default 2)
//   IMAGE_BREAKER_COOLDOWN_MS  how long to deprioritize (default 120000)
//   IMAGE_BREAKER_DISABLED=true disable entirely
type BreakerState = { failures: number; openUntil: number };
const breaker = new Map<string, BreakerState>();
const BREAKER_THRESHOLD = Number(process.env.IMAGE_BREAKER_THRESHOLD) || 2;
const BREAKER_COOLDOWN_MS = Number(process.env.IMAGE_BREAKER_COOLDOWN_MS) || 120_000;
const BREAKER_DISABLED = process.env.IMAGE_BREAKER_DISABLED === "true";

function isCircuitOpen(name: string): boolean {
  if (BREAKER_DISABLED) return false;
  const s = breaker.get(name);
  return !!s && s.openUntil > Date.now();
}

function recordProviderResult(name: string, ok: boolean): void {
  if (ok) {
    breaker.delete(name);
    return;
  }
  const s = breaker.get(name) ?? { failures: 0, openUntil: 0 };
  s.failures += 1;
  if (s.failures >= BREAKER_THRESHOLD) s.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
  breaker.set(name, s);
}

async function withProviderFallback(
  override: string | undefined,
  run: (p: ImageProviderInterface) => Promise<GeneratedImage>,
  label: string,
): Promise<GeneratedImage> {
  const chain = providerChain(override);
  // Deprioritize tripped providers to the back so healthy fallbacks run first
  // (a dead KingCong no longer eats the request budget before diaflow is tried).
  const live = chain.filter((n) => !isCircuitOpen(n));
  const tripped = chain.filter((n) => isCircuitOpen(n));
  const order = [...live, ...tripped];
  if (tripped.length) {
    console.warn(
      `[image:${label}] circuit open for [${tripped.join(", ")}] — deprioritized; trying [${live.join(", ") || "none"}] first`,
    );
  }
  let lastErr: unknown;
  for (let i = 0; i < order.length; i++) {
    const name = order[i];
    try {
      const res = await run(getProvider(name));
      recordProviderResult(name, true);
      return res;
    } catch (err) {
      recordProviderResult(name, false);
      lastErr = err;
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      const more = i < order.length - 1 ? ` — routing to "${order[i + 1]}"` : " (last provider in chain)";
      console.warn(`[image:${label}] provider "${name}" failed: ${msg}${more}`);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`all image providers failed (${order.join(" -> ")}): ${String(lastErr)}`);
}

/**
 * Normalize image URL: resolve relative R2 paths to full URLs.
 * Ensures any /assets/... path becomes https://cdn.example.com/assets/...
 */
function normalizeImageUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  const base = (
    process.env.R2_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
    ""
  ).replace(/\/$/, "");
  if (base) return `${base}/${url.replace(/^\//, "")}`;
  return url;
}

// --- Core functions (delegate to active provider) ---

export async function generateImage(
  prompt: string,
  options?: ImageGenerationOptions,
): Promise<GeneratedImage> {
  const img = await withProviderFallback(
    options?.provider,
    (p) => p.generateImage(prompt, options),
    "generate",
  );
  return options?.rawSize ? img : normalizeGeneratedImage(img);
}

export async function editImage(
  imageUrl: string,
  prompt: string,
  options?: ColorizeOptions,
): Promise<GeneratedImage> {
  const url = normalizeImageUrl(imageUrl);
  const img = await withProviderFallback(
    options?.provider,
    (p) => p.editImage(url, prompt, options),
    "edit",
  );
  return options?.rawSize ? img : normalizeGeneratedImage(img);
}

// --- Domain-specific wrappers ---

export type CharacterExtractionOptions = ImageGenerationOptions & {
  /** URL of the original page image to extract from (enables image-to-image extraction) */
  sourceImageUrl?: string;
  /** Character name for targeted extraction when multiple characters exist */
  characterName?: string;
  /** Additional character info to help identify the target character */
  characterInfo?: string;
};

export type LocationExtractionOptions = ImageGenerationOptions & {
  /** URL of the original page image to extract from (enables image-to-image extraction) */
  sourceImageUrl?: string;
  /** Location name for targeted extraction */
  locationName?: string;
};

/**
 * Generate a 1x1 white pixel PNG as a blank canvas for editImage.
 * This forces the AI to generate fresh instead of modifying an existing scene.
 */
const BLANK_WHITE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
let _blankWhiteDataUrl: string | null = null;
function getBlankWhiteDataUrl(): string {
  if (!_blankWhiteDataUrl) {
    _blankWhiteDataUrl = `data:image/png;base64,${BLANK_WHITE_PNG_BASE64}`;
  }
  return _blankWhiteDataUrl;
}

export async function generateCharacterReference(
  characterPrompt: string,
  options?: CharacterExtractionOptions,
): Promise<GeneratedImage> {
  const { sourceImageUrl, characterName, characterInfo, ...imageOptions } = options || {};

  const prompt = buildCharacterExtractionPrompt(characterPrompt, characterName, characterInfo);

  if (sourceImageUrl) {
    // Use blank white image as edit base + source scene as reference.
    // This way AI generates on white canvas but sees the character from the reference.
    return editImage(getBlankWhiteDataUrl(), prompt, {
      ...imageOptions,
      referenceImageUrls: [normalizeImageUrl(sourceImageUrl)],
    });
  }

  return generateImage(prompt, imageOptions);
}

export async function generateLocationReference(
  locationPrompt: string,
  options?: LocationExtractionOptions,
): Promise<GeneratedImage> {
  const { sourceImageUrl, locationName, ...imageOptions } = options || {};

  const prompt = buildLocationExtractionPrompt(locationPrompt, locationName);

  if (sourceImageUrl) {
    return editImage(getBlankWhiteDataUrl(), prompt, {
      ...imageOptions,
      referenceImageUrls: [normalizeImageUrl(sourceImageUrl)],
    });
  }

  return generateImage(prompt, imageOptions);
}

export async function generateBookCover(
  title: string,
  description?: string,
  options?: ImageGenerationOptions,
): Promise<GeneratedImage> {
  return generateImage(
    `Professional book cover for "${title}" coloring book. Vibrant colors, eye-catching design. ${description || ""}`,
    options,
  );
}

export async function generateCategoryIcon(
  prompt: string,
  options?: ImageGenerationOptions,
): Promise<GeneratedImage> {
  return generateImage(buildCategoryIconPrompt(prompt), options);
}

export type ColoringPageOptions = ImageGenerationOptions & {
  artStyle?: {
    referenceImageUrls: string[];
    generationDirective: string;
  };
  /** Character reference image URLs — passed as visual context so the AI preserves character identity */
  characterReferenceImageUrls?: string[];
  /** Location reference image URLs — passed as visual context for environment consistency */
  locationReferenceImageUrls?: string[];
};

export async function generateColoringPage(
  prompt: string,
  options?: ColoringPageOptions,
): Promise<GeneratedImage> {
  const { artStyle, characterReferenceImageUrls, locationReferenceImageUrls, ...imageOptions } =
    options || {};

  const sizeOpts = { size: "1024x1024" as const, ...imageOptions };
  const fullPrompt = buildColoringPageGenerationPrompt(prompt, artStyle?.generationDirective);

  // Collect all reference image URLs (character + location + art style)
  const allReferenceUrls: string[] = [
    ...(characterReferenceImageUrls || []),
    ...(locationReferenceImageUrls || []),
    ...(artStyle?.referenceImageUrls || []),
  ].filter(Boolean);

  // Use editImage when we have reference images for character/location identity preservation
  if (allReferenceUrls.length > 0) {
    // First reference image is the "primary" input, rest are additional references
    const [primaryUrl, ...restUrls] = allReferenceUrls;
    return editImage(primaryUrl, fullPrompt, {
      ...sizeOpts,
      referenceImageUrls: restUrls.length > 0 ? restUrls : undefined,
    });
  }

  return generateImage(fullPrompt, sizeOpts);
}

export async function colorizeImage(
  imageUrl: string,
  colorizationDirective: string,
  options: ColorizeOptions = {},
): Promise<GeneratedImage> {
  const { buildColorizationPrompt, buildColorizationPromptCompact } = await import(
    "./prompts/colorization-prompt-template"
  );
  const colorizePrompt = usesCompactPrompts(options?.provider)
    ? buildColorizationPromptCompact(colorizationDirective)
    : buildColorizationPrompt(colorizationDirective);
  return editImage(imageUrl, colorizePrompt, options);
}

/**
 * Cover-source generation — single combined image-to-image call that BOTH
 * colorizes the B&W page AND recomposes it into a book-cover-ready layout
 * (main illustration in the lower 55–70%, clean title-safe area up top with a
 * sparse on-brand background pattern). Output is text-free; typography is added
 * later by generateAiCover. Mirrors colorizeImage's signature so it can be
 * swapped straight into the cover pipeline's dependency slot.
 */
export async function generateCoverSource(
  imageUrl: string,
  colorizationDirective: string,
  options: ColorizeOptions = {},
): Promise<GeneratedImage> {
  const { buildCoverSourcePrompt, buildCoverSourcePromptCompact } = await import(
    "./prompts/cover-source-prompt-template"
  );
  const coverSourcePrompt = usesCompactPrompts(options?.provider)
    ? buildCoverSourcePromptCompact(colorizationDirective)
    : buildCoverSourcePrompt(colorizationDirective);
  // Cover generation runs on Diaflow's GPT-image flow.
  return editImage(imageUrl, coverSourcePrompt, { ...options, flow: "gpt_image" });
}

/**
 * B&W cover-source generation — recompose the interior line-art into a cover
 * LAYOUT (title-safe area at top/middle/bottom, illustration in the rest) while
 * staying pure black-and-white line art. NEVER colorizes. Uses the same
 * editImage path as generateCoverSource.
 */
export async function generateCoverSourceBW(
  imageUrl: string,
  titleSafe: "top" | "middle" | "bottom",
  options: ColorizeOptions = {},
  promptOverride?: string,
): Promise<GeneratedImage> {
  const { buildCoverSourceBWPrompt, buildCoverSourceBWPromptCompact } = await import(
    "./prompts/cover-source-bw-prompt-template"
  );
  // Operators can pass a custom prompt (the staging prompt-tuning tool in the
  // Source Cover dialog) to iterate without a redeploy; empty/whitespace falls
  // back to the built-in default for the position. KingCong (4000-char cap) uses
  // the compact variant so the full 17k–28k prompt isn't tail-truncated.
  const buildDefault = usesCompactPrompts(options?.provider) ? buildCoverSourceBWPromptCompact : buildCoverSourceBWPrompt;
  const prompt = promptOverride?.trim() ? promptOverride : buildDefault(titleSafe);
  // Cover generation runs on Diaflow's GPT-image flow.
  return editImage(imageUrl, prompt, { ...options, flow: "gpt_image" });
}
