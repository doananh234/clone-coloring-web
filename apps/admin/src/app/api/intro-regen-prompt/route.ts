// apps/admin/src/app/api/intro-regen-prompt/route.ts
// Default prompt for the INTRO page regen dialog, one per variant. The sibling
// /api/page-regen-prompt serves interior pages and is untouched.
//
// The dialog prefills its editable box from here, so what this returns must be
// exactly what the worker will send. Title and subtitle are inlined from the
// book because quoting the strings helps the image model spell them.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { buildIntroRegenPrompt, type IntroPageVariant } from "@vx/server-core/ai/prompts";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("variant");
  const variant: IntroPageVariant = raw === "text" ? "text" : "title";

  // A text page never quotes the book title, so skip the lookup entirely.
  if (variant === "text") {
    return NextResponse.json({ prompt: buildIntroRegenPrompt({ variant }) });
  }

  const bookId = req.nextUrl.searchParams.get("bookId");
  if (!bookId) {
    return NextResponse.json({ error: "bookId is required for the title variant" }, { status: 400 });
  }

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: { title: true, subtitle: true },
  });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  return NextResponse.json({
    prompt: buildIntroRegenPrompt({
      variant,
      title: book.title ?? undefined,
      subtitle: book.subtitle ?? undefined,
    }),
  });
}

export const dynamic = "force-dynamic";
