import { NextRequest, NextResponse } from "next/server";
import { visionAnalyzeJSON } from "@vx/server-core/ai/llm-provider";
import { flushLangfuse } from "@vx/server-core/langfuse";
import { prisma } from "@vx/db";
import {
  buildBookMetaPrompt,
  type BookMetaGenerationResult,
  type CategoryOption,
} from "@vx/server-core/ai/prompts/book-meta-prompt";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { thumbnailUrl } = body as { thumbnailUrl?: string };

    if (!thumbnailUrl) {
      return NextResponse.json(
        { error: "thumbnailUrl is required" },
        { status: 400 },
      );
    }

    // Fetch existing categories for AI matching
    const catRows = await prisma.category.findMany({ orderBy: { index: "asc" } });
    const categories: CategoryOption[] = catRows.map((doc) => ({
      id: doc.id,
      displayName: doc.displayName || doc.name || doc.id,
    }));

    const { systemPrompt, userPrompt } = buildBookMetaPrompt(categories);

    const data = await visionAnalyzeJSON<BookMetaGenerationResult>(
      thumbnailUrl,
      userPrompt,
      {
        systemPrompt,
        maxTokens: 4096,
        temperature: 0.7,
        trace: { caller: "generate/book-meta", entityType: "book" },
      },
    );

    await flushLangfuse();

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
