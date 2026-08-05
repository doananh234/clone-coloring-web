/**
 * Color-variant model for ColoringStyle. One style groups MANY color palettes:
 * each variant is one palette (primary/accent colors + tone/warmth/saturation)
 * captured from a source cover. This replaces the old "one new ColoringStyle row
 * per book" behaviour that produced heavy duplication.
 *
 * A variant is stored opaquely in `ColoringStyle.variants` (Json array). Pure
 * helpers only — no DB access — so both the worker and admin flows can share
 * them (see upsert-coloring-style-with-variant.ts for the DB side).
 */

/** The palette shape extracted by COLORING_STYLE_EXTRACTION_PROMPT. */
export interface ColorPalette {
  warmth?: string;
  saturation?: string;
  description?: string;
  primaryColors?: string[];
  accentColors?: string[];
  backgroundTone?: string;
}

/** One color variant of a ColoringStyle. */
export interface ColoringStyleVariant {
  id: string;
  colorPalette: ColorPalette;
  thumbnailUrl: string;
  colorizationDirective: string;
  sourceBookId: string | null;
  createdAt: string;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Read the `variants` Json column into a typed array (tolerant of bad data). */
export function readVariants(raw: unknown): ColoringStyleVariant[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is ColoringStyleVariant => isObj(v) && typeof v.id === "string");
}

/**
 * Stable fingerprint of a palette so identical colors aren't stored twice.
 * Colors are lowercased + sorted (order-independent); tone/warmth/saturation
 * included so a re-tinted palette counts as distinct. `description` is ignored
 * (free text varies run-to-run for the same colors).
 */
export function paletteFingerprint(palette: ColorPalette | null | undefined): string {
  const p = palette ?? {};
  const norm = (arr?: string[]) =>
    (Array.isArray(arr) ? arr : [])
      .map((c) => String(c).trim().toLowerCase())
      .filter(Boolean)
      .sort();
  return JSON.stringify({
    primary: norm(p.primaryColors),
    accent: norm(p.accentColors),
    background: (p.backgroundTone || "").trim().toLowerCase(),
    warmth: (p.warmth || "").trim().toLowerCase(),
    saturation: (p.saturation || "").trim().toLowerCase(),
  });
}

/** Build a variant object from a parsed extraction. `now` is injected so
 *  callers control the timestamp (scripts vs runtime). */
export function buildColoringStyleVariant(
  parsed: Record<string, unknown>,
  opts: { id: string; referenceUrl: string; sourceBookId?: string | null; now: string },
): ColoringStyleVariant {
  const rawReferenceUrl = (opts.referenceUrl || "").split("?")[0];
  return {
    id: opts.id,
    colorPalette: (parsed.colorPalette as ColorPalette) || {},
    thumbnailUrl: rawReferenceUrl,
    colorizationDirective:
      typeof parsed.colorizationDirective === "string" ? parsed.colorizationDirective.trim() : "",
    sourceBookId: opts.sourceBookId ?? null,
    createdAt: opts.now,
  };
}
