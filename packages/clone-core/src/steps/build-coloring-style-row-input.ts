import { Prisma } from "@vx/db";

/**
 * Pure field-mapping helper shared by BOTH cover flows that create a
 * ColoringStyle row from a source page's extracted style:
 *   - admin  create-book route (extract-source-style.ts)
 *   - worker generate-cover step (generate-cover.ts)
 *
 * It ONLY maps the raw parsed JSON (output of COLORING_STYLE_EXTRACTION_PROMPT)
 * to a Prisma create-data object. It does NOT touch the DB and does NOT import
 * `@vx/server-core`, so both call sites can reach it (admin depends on
 * `@vx/clone-core`; clone-core depends only on `@vx/db`). Each caller passes the
 * result to its own `db.coloringStyle.create({ data })`.
 *
 * URL handling: the query string is stripped from `referenceUrl` before it is
 * persisted so both flows store the SAME raw-key shape. We keep the codebase's
 * raw-key-then-resolve-on-read convention — the RAW (un-resolved) key is
 * persisted into `referenceImages`/`thumbnailUrl`; callers resolve R2 URLs only
 * at read time.
 */
export function buildColoringStyleRowInput(
  parsed: Record<string, unknown>,
  opts: { referenceUrl: string; fallbackName: string },
): Prisma.ColoringStyleCreateInput {
  const rawReferenceUrl = (opts.referenceUrl || "").split("?")[0];
  const name =
    (typeof parsed.name === "string" && parsed.name.trim()) || opts.fallbackName;

  return {
    name,
    description: (parsed.description as string) || "",
    referenceImages: [{ url: rawReferenceUrl, label: "source-cover" }],
    thumbnailUrl: rawReferenceUrl,
    medium: (parsed.medium as object) || {},
    colorPalette: (parsed.colorPalette as object) || {},
    shadingAndLighting: (parsed.shadingAndLighting as object) || {},
    fillBehavior: (parsed.fillBehavior as object) || {},
    overallFeel: (parsed.overallFeel as object) || {},
    colorizationDirective: (parsed.colorizationDirective as string) || "",
    tags: Array.isArray(parsed.tags) ? (parsed.tags as string[]) : [],
  };
}
