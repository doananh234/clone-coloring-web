export type TitleSafePosition = "top" | "middle" | "bottom";

/** On-demand B&W cover source built from an interior page.
 *  Lives in book.data.sourceCovers[]. `url` is the B&W recompose and is NEVER
 *  replaced by colorize; `coloredUrl` holds the colored result (also surfaced in
 *  the book's "Colored" section). */
export interface SourceCover {
  id: string;
  url: string;
  coloredUrl?: string;
  isPublic?: boolean;
  titleSafe: TitleSafePosition;
  sourceInteriorId: string;
  coloringStyleId?: string;
  coloringVariantId?: string | null;
  createdAt: string;
}

export function coloredSourceCovers(covers: SourceCover[]): SourceCover[] {
  return covers.filter((c) => !!c.coloredUrl);
}

export function upsertColoredSourceCover(
  covers: SourceCover[],
  scId: string,
  coloredUrl: string,
  styleId?: string,
  variantId?: string | null,
): SourceCover[] {
  return covers.map((c) =>
    c.id === scId
      ? { ...c, coloredUrl, coloringStyleId: styleId ?? c.coloringStyleId, coloringVariantId: variantId !== undefined ? variantId : c.coloringVariantId }
      : c,
  );
}
