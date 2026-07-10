import { NextRequest, NextResponse } from "next/server";
import { visionAnalyzeJSON } from "@vx/server-core/ai/llm-provider";
import { FONT_CATALOG } from "@vx/server-core/text-overlay";
import {
  buildCoverDesignPrompt,
  type CoverDesignContext,
  type CoverDesignPack,
} from "@vx/server-core/ai/prompts/cover-design-prompt";

interface RequestBody {
  sourceThumbnailUrl?: string;
  bookContext?: Partial<CoverDesignContext>;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;
    const { sourceThumbnailUrl, bookContext } = body;

    if (!sourceThumbnailUrl || typeof sourceThumbnailUrl !== "string") {
      return NextResponse.json(
        { error: "sourceThumbnailUrl is required" },
        { status: 400 },
      );
    }
    if (!bookContext?.title) {
      return NextResponse.json(
        { error: "bookContext.title is required" },
        { status: 400 },
      );
    }

    const context: CoverDesignContext = {
      title: bookContext.title,
      subtitle: bookContext.subtitle,
      brandName: bookContext.brandName,
      category: bookContext.category,
      ageRange: bookContext.ageRange,
      tone: bookContext.tone,
    };
    const fontChoices = FONT_CATALOG.map((f) => f.family);
    const { systemPrompt, userPrompt } = buildCoverDesignPrompt(context, fontChoices);

    const pack = await visionAnalyzeJSON<CoverDesignPack>(
      sourceThumbnailUrl,
      `${systemPrompt}\n\n${userPrompt}`,
      { maxTokens: 2000, temperature: 0.4 },
    );

    return NextResponse.json(pack);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Prevent Next from caching this route
export const dynamic = "force-dynamic";
