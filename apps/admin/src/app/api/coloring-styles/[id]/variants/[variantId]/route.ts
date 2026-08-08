import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { removeVariant } from "@vx/clone-core";

/**
 * DELETE /api/coloring-styles/[id]/variants/[variantId]
 *
 * Removes ONE color variant from a ColoringStyle's `variants[]`. A variant is a
 * JSON element, not its own row (see clone-core/coloring-style-variant.ts), so
 * "deleting" it means rewriting the array. When variant #1 (index 0) is removed
 * the style's top-level colorPalette/thumbnailUrl/colorizationDirective — which
 * mirror variant #1 — are re-mirrored from the new first variant.
 *
 * Guards:
 *  - last variant → 409 { error: "last-variant" } (delete the whole style instead).
 *  - variant in use by books (coverMeta.coloringVariantId) → 409 { error: "in-use",
 *    inUseBy } unless `?force=true` (warn-then-allow; ref becomes orphaned).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> },
) {
  const { id, variantId } = await params;
  const force = req.nextUrl.searchParams.get("force") === "true";
  try {
    const style = await prisma.coloringStyle.findUnique({
      where: { id },
      select: { id: true, variants: true },
    });
    if (!style) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const result = removeVariant(style.variants, variantId);
    if (!result.removed) {
      if (result.wasLast) {
        return NextResponse.json(
          {
            error: "last-variant",
            message: "Đây là bảng màu cuối cùng — hãy xoá cả style thay vì variant.",
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "variant-not-found" }, { status: 404 });
    }

    // Ref guard: books pin an exact variant via data.coverMeta.coloringVariantId.
    // Warn (block without force) so the operator knows the ref will be orphaned.
    const inUseBy = await prisma.book.count({
      where: { data: { path: ["coverMeta", "coloringVariantId"], equals: variantId } },
    });
    if (inUseBy > 0 && !force) {
      return NextResponse.json({ error: "in-use", inUseBy }, { status: 409 });
    }

    await prisma.coloringStyle.update({
      where: { id },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json input
        variants: result.variants as any,
        ...(result.topLevel
          ? {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json input
              colorPalette: result.topLevel.colorPalette as any,
              thumbnailUrl: result.topLevel.thumbnailUrl,
              colorizationDirective: result.topLevel.colorizationDirective,
            }
          : {}),
      },
    });

    return NextResponse.json({ success: true, removed: true, inUseBy });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
