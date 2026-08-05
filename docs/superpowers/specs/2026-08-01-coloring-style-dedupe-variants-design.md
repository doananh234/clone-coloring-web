# ColoringStyle dedupe + color variants — Design

**Date:** 2026-08-01
**Status:** Approved (implemented)

## Problem

`/styles/colorstyles` shows many duplicate coloring styles. Root cause: both
auto-extraction paths (`generate-cover.ts` worker step, `extract-source-style.ts`
admin create-book) call `db.coloringStyle.create` unconditionally — one new row
per book. Prod: 104 rows / 87 distinct names, plus many near-duplicate names.

A style differs from its duplicates mostly in **color palette**. So: one style
by name should hold many **color variants** (each variant = one palette:
primary/accent colors + tone/warmth/saturation) instead of many style rows.

## Decisions

- **Backfill grouping:** AI semantic clustering by name+description (review before apply).
- **Storage:** `ColoringStyle.variants` JSON array (no relational table).
- **Book references:** remap `coverMeta.coloringStyleId` → canonical id AND record `coverMeta.coloringVariantId` (exact palette preserved).
- **Go-forward:** normalized-name upsert — append variant (skip identical palette by fingerprint); no AI at runtime.

## Data model

`ColoringStyle.variants Json @default("[]")`. Each variant:

```jsonc
{ "id": "uuid", "colorPalette": { warmth, saturation, description,
  primaryColors[], accentColors[], backgroundTone },
  "thumbnailUrl": "raw R2 key", "colorizationDirective": "…",
  "sourceBookId": "…|null", "createdAt": "ISO" }
```

Style-level shared fields unchanged (name, description, medium, shadingAndLighting,
fillBehavior, overallFeel, tags). The style's own `colorPalette`/`thumbnailUrl`
mirror variant #1. `paletteFingerprint()` (sorted+lowercased colors + tone +
warmth + saturation; ignores description) dedupes identical palettes.

## Components

- `packages/clone-core/src/steps/coloring-style-variant.ts` — types, `paletteFingerprint`, `readVariants`, `buildColoringStyleVariant` (pure; unit-tested).
- `packages/clone-core/src/steps/upsert-coloring-style-with-variant.ts` — `upsertColoringStyleWithVariant(db, parsed, opts)`: match by case-insensitive name → append variant / dedupe / create. Returns `{ styleId, variantId, created, deduped }`.
- Callers refactored: `generate-cover.ts` + `extract-source-style.ts` → upsert; both persist `coloringVariantId` into `book.data.coverMeta`.
- `apps/worker/src/scripts/dedupe-coloring-styles.ts` — `--propose` (LLM cluster → JSON, read-only) / `--apply [--commit]` (merge variants, remap book+brand refs, back up to file, delete merged rows).
- API: list + detail already return all columns → `variants` flows through automatically.
- UI: detail `ColorVariantsSection` (palette swatches + source thumbnail per variant); list card shows swatches + "N màu" badge.

## Rollout

1. Deploy (`prisma db push` adds `variants`, ships runtime upsert + UI).
2. `yarn dedupe:styles --propose` → review the cluster JSON.
3. `yarn dedupe:styles --apply` (dry-run) → `--apply --commit` (persist; backup file written first).

## Out of scope (YAGNI)

Variant editing UI, fuzzy runtime name matching, auto-merging near-dupe names at runtime.
