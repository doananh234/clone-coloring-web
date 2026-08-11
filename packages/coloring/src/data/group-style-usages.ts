/** One book page colorized with a given coloring style. */
export interface StyleUsage {
  bookId: string;
  bookTitle: string;
  pageId: string;
  coloredUrl: string;
  coloringVariantId: string | null;
}

/** Minimal shape of a ColoringStyle color variant needed for grouping. */
export interface UsageVariant {
  id?: string;
  colorPalette?: { primaryColors?: string[] };
}

/** Usages bucketed under one color variant (or the trailing "unknown" bucket). */
export interface UsageGroup {
  variantId: string | null;
  label: string;
  swatches: string[];
  usages: StyleUsage[];
}

/** Group usages by coloringVariantId. Known variants (in `variants` order) each get a
 *  "Bảng màu N" group with the variant's primaryColors as swatches; usages whose
 *  variantId is null or matches no variant fall into one trailing "Khác" group. Empty
 *  groups are omitted. */
export function groupUsagesByVariant(
  usages: StyleUsage[],
  variants: UsageVariant[] | undefined,
): UsageGroup[] {
  const list = Array.isArray(variants) ? variants : [];
  const groups: UsageGroup[] = [];
  const claimed = new Set<StyleUsage>();

  list.forEach((v, i) => {
    if (!v.id) return;
    const vUsages = usages.filter((usage) => usage.coloringVariantId === v.id);
    if (vUsages.length === 0) return;
    vUsages.forEach((usage) => claimed.add(usage));
    groups.push({
      variantId: v.id,
      label: `Bảng màu ${i + 1}`,
      swatches: v.colorPalette?.primaryColors ?? [],
      usages: vUsages,
    });
  });

  const rest = usages.filter((usage) => !claimed.has(usage));
  if (rest.length > 0) {
    groups.push({ variantId: null, label: "Khác · không rõ bảng màu", swatches: [], usages: rest });
  }
  return groups;
}
