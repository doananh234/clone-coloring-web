import type { PrismaClient } from "@vx/db";
import { cieq } from "@vx/db";
import { buildColoringStyleRowInput } from "./build-coloring-style-row-input";
import {
  buildColoringStyleVariant,
  paletteFingerprint,
  readVariants,
  type ColoringStyleVariant,
} from "./coloring-style-variant";

export interface UpsertColoringStyleResult {
  styleId: string;
  variantId: string;
  /** true when a brand-new style row was created (vs. a variant appended). */
  created: boolean;
  /** true when the palette matched an existing variant (nothing written). */
  deduped: boolean;
}

/**
 * Upsert a ColoringStyle from a parsed extraction, deduping by NAME and folding
 * distinct palettes into `variants` instead of creating a new row every time.
 *
 * - Match: case-insensitive equal name (oldest row wins as canonical).
 * - Found + identical palette (by fingerprint): no write, return that variant.
 * - Found + new palette: append a variant.
 * - Not found: create the style; its palette becomes variant #1.
 *
 * Pure name matching (no AI) — cheap enough for the request path. The one-time
 * AI semantic merge of historical near-duplicate names is a separate script.
 */
export async function upsertColoringStyleWithVariant(
  db: PrismaClient,
  parsed: Record<string, unknown>,
  opts: { referenceUrl: string; fallbackName: string; sourceBookId?: string | null },
): Promise<UpsertColoringStyleResult> {
  const rowInput = buildColoringStyleRowInput(parsed, {
    referenceUrl: opts.referenceUrl,
    fallbackName: opts.fallbackName,
  });
  const name = rowInput.name;
  const now = new Date().toISOString();

  const existing = await db.coloringStyle.findFirst({
    where: { name: cieq(name) },
    orderBy: { createdAt: "asc" },
    select: { id: true, variants: true, colorPalette: true, thumbnailUrl: true, colorizationDirective: true },
  });

  if (!existing) {
    const variant = buildColoringStyleVariant(parsed, {
      id: crypto.randomUUID(),
      referenceUrl: opts.referenceUrl,
      sourceBookId: opts.sourceBookId ?? null,
      now,
    });
    const created = await db.coloringStyle.create({
      data: {
        ...rowInput,
        sourceBookId: opts.sourceBookId ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json input
        variants: [variant] as any,
      },
      select: { id: true },
    });
    return { styleId: created.id, variantId: variant.id, created: true, deduped: false };
  }

  // Seed variant #1 from the row's own palette if it predates the variants model.
  const variants: ColoringStyleVariant[] = readVariants(existing.variants);
  if (variants.length === 0) {
    variants.push(
      buildColoringStyleVariant(
        { colorPalette: existing.colorPalette, colorizationDirective: existing.colorizationDirective ?? "" },
        { id: crypto.randomUUID(), referenceUrl: existing.thumbnailUrl ?? "", sourceBookId: null, now },
      ),
    );
  }

  const fp = paletteFingerprint((parsed.colorPalette as never) ?? {});
  const match = variants.find((v) => paletteFingerprint(v.colorPalette) === fp);
  if (match) {
    // Identical palette already present — persist any seeded variant #1, no dupe.
    if (readVariants(existing.variants).length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json input
      await db.coloringStyle.update({ where: { id: existing.id }, data: { variants: variants as any } });
    }
    return { styleId: existing.id, variantId: match.id, created: false, deduped: true };
  }

  const variant = buildColoringStyleVariant(parsed, {
    id: crypto.randomUUID(),
    referenceUrl: opts.referenceUrl,
    sourceBookId: opts.sourceBookId ?? null,
    now,
  });
  variants.push(variant);
  await db.coloringStyle.update({
    where: { id: existing.id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json input
    data: { variants: variants as any },
  });
  return { styleId: existing.id, variantId: variant.id, created: false, deduped: false };
}
