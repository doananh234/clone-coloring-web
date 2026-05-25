import { NextRequest, NextResponse } from "next/server";
import { textPrompt } from "@/lib/ai/llm-provider";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { category, storyIdea } = body as {
      category?: string;
      storyIdea?: string;
    };

    if (!category && !storyIdea) {
      return NextResponse.json({ error: "category or storyIdea required" }, { status: 400 });
    }

    const prompt = `Generate book information for a coloring book.

${category ? `Category: ${category}` : ""}
${storyIdea ? `Story idea: ${storyIdea}` : ""}

Return a JSON object with:
{
  "title": "catchy coloring book title (under 60 chars, include 'Coloring Book' in title)",
  "subtitle": "short subtitle (under 40 chars)",
  "description": "compelling 2-3 sentence book description for a product listing",
  "price": "suggested price as string (e.g. '7.99')"
}

Rules:
- Title should be marketable and specific to the category/story
- Description should highlight what makes this book special and who it's for
- Price should be between 5.99 and 14.99 based on perceived value
- Return ONLY valid JSON, no markdown or explanation`;

    const result = await textPrompt(prompt, {
      maxTokens: 500,
      temperature: 0.8,
      jsonMode: true,
    });

    const parsed = JSON.parse(result);

    return NextResponse.json({
      success: true,
      title: parsed.title || "",
      subtitle: parsed.subtitle || "",
      description: parsed.description || "",
      price: parsed.price || "7.99",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
