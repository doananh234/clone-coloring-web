// apps/admin/src/app/api/books/[bookId]/source-covers/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@vx/db";
import { getR2Config, createR2Client, uploadToR2, resolveR2Url } from "@vx/server-core/r2";
import { generateCoverSourceBW } from "@vx/server-core/ai";
import type { SourceCover, TitleSafePosition } from "@vx/coloring/data/source-covers";

// Diaflow recompose runs inline; allow a long budget.
export const maxDuration = 300;

type RouteParams = { params: Promise<{ bookId: string }> };
type Page = { id?: string; url?: string };

/** POST — convert one interior page into a B&W source cover (synchronous). */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId } = await params;
    const { interiorPageId, titleSafe } = (await req.json().catch(() => ({}))) as {
      interiorPageId?: string; titleSafe?: TitleSafePosition;
    };
    if (!interiorPageId || !titleSafe)
      return NextResponse.json({ error: "interiorPageId and titleSafe are required" }, { status: 400 });

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

    const pages = (book.coloringPages as Page[] | null) ?? [];
    const interior = pages.find((p) => p.id === interiorPageId);
    if (!interior?.url)
      return NextResponse.json({ error: "Interior page not found" }, { status: 404 });

    const img = await generateCoverSourceBW(resolveR2Url(interior.url), titleSafe, {
      trace: { caller: "books/source-covers" },
    });

    const scId = crypto.randomUUID();
    const r2Config = getR2Config();
    const buffer = Buffer.from(img.dataUrl.split(",")[1], "base64");
    const { url } = await uploadToR2({
      client: createR2Client(r2Config), config: r2Config,
      key: `assets/${bookId}/source-covers/${scId}.png`, body: buffer, contentType: "image/png",
    });

    const sourceCover: SourceCover = {
      id: scId, url, isPublic: false, titleSafe,
      sourceInteriorId: interiorPageId, createdAt: new Date().toISOString(),
    };
    const data = (book.data as Record<string, unknown> | null) ?? {};
    const sourceCovers = [ ...((data.sourceCovers as SourceCover[] | undefined) ?? []), sourceCover ];
    await prisma.book.update({ where: { id: bookId }, data: { data: { ...data, sourceCovers } as never } });

    return NextResponse.json({ success: true, sourceCover });
  } catch (error) {
    console.error("[books/source-covers POST] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

/** PATCH — toggle isPublic on one source cover. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { bookId } = await params;
    const { scId, isPublic } = (await req.json().catch(() => ({}))) as { scId?: string; isPublic?: boolean };
    if (!scId) return NextResponse.json({ error: "scId required" }, { status: 400 });

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

    const data = (book.data as Record<string, unknown> | null) ?? {};
    const sourceCovers = ((data.sourceCovers as SourceCover[] | undefined) ?? []).map((c) =>
      c.id === scId ? { ...c, isPublic: isPublic ?? !c.isPublic } : c,
    );
    await prisma.book.update({ where: { id: bookId }, data: { data: { ...data, sourceCovers } as never } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[books/source-covers PATCH] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
