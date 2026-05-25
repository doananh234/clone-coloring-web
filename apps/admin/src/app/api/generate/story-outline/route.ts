import { NextRequest, NextResponse } from "next/server";
import { textPrompt, buildStoryOutlinePrompt } from "@/lib/ai";

type SceneOutline = {
  sceneNumber: number;
  locationName: string;
  locationModifier: string;
  sceneElements: string[];
  characterNames: string[];
  activity: string;
  mood: string;
  composition: string;
};

type CharacterInput = {
  name: string;
  characterPrompt: string;
  referenceImageUrl?: string;
};

type LocationInput = {
  name: string;
  locationPrompt: string;
  referenceImageUrl?: string;
};

/** Per-scene prompt with associated reference image URLs */
export type ScenePromptData = {
  prompt: string;
  characterReferenceImageUrls: string[];
  locationReferenceImageUrls: string[];
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, pageCount, characters, locations, style } = body as {
      title: string;
      description?: string;
      pageCount: number;
      characters: CharacterInput[];
      locations: LocationInput[];
      style: string;
    };

    if (!title || !pageCount) {
      return NextResponse.json({ error: "title and pageCount required" }, { status: 400 });
    }

    // Step 1: Generate story outline
    const outlinePrompt = buildStoryOutlinePrompt({
      title,
      description,
      pageCount: Math.min(Math.max(pageCount, 5), 50),
      characters: characters || [],
      locations: locations || [],
      style: style || "cartoon",
    });

    const outlineJson = await textPrompt(outlinePrompt, {
      maxTokens: 8000,
      temperature: 0.8,
      jsonMode: true,
    });

    const parsed = JSON.parse(outlineJson);
    const scenes: SceneOutline[] = parsed.scenes || [];

    // Step 2: Build image prompts + reference image URLs from outline
    const charMap = new Map((characters || []).map((c) => [c.name, c]));
    const locMap = new Map((locations || []).map((l) => [l.name, l]));

    const scenePrompts: ScenePromptData[] = scenes.map((scene) => {
      // Build character part — collect prompts and reference image URLs
      const sceneChars = scene.characterNames
        .map((name) => charMap.get(name))
        .filter(Boolean) as CharacterInput[];
      const charPrompts = scene.characterNames
        .map((name) => charMap.get(name)?.characterPrompt || name)
        .join(", and ");
      const characterReferenceImageUrls = sceneChars
        .map((c) => c.referenceImageUrl)
        .filter(Boolean) as string[];

      // Build location part with modifier and scene elements
      const locData = locMap.get(scene.locationName);
      const baseLoc = locData?.locationPrompt || scene.locationName;
      const locWithMod = `${baseLoc}, ${scene.locationModifier}`;
      const elements = scene.sceneElements?.length
        ? `, with ${scene.sceneElements.join(", ")} in the scene`
        : "";
      const locationReferenceImageUrls = locData?.referenceImageUrl
        ? [locData.referenceImageUrl]
        : [];

      // Build character reference labels for the prompt
      const charRefLabels = sceneChars
        .filter((c) => c.referenceImageUrl)
        .map((c) => `${c.name}: [see CHARACTER REFERENCE IMAGE]`)
        .join("\n  ");

      // Combine into final image prompt
      const charRefSection = charRefLabels
        ? `\n\nCHARACTER REFERENCES:\n  ${charRefLabels}\n\nUse the provided reference images to preserve each character's exact identity, features, proportions, and accessories. Draw them in the scene's style, NOT in the reference image's style.`
        : "";

      const prompt = `${charPrompts}, ${scene.activity}, in ${locWithMod}${elements}, ${scene.composition}, ${scene.mood} mood${charRefSection}`;

      return { prompt, characterReferenceImageUrls, locationReferenceImageUrls };
    });

    // Backward-compatible: also return flat prompts array
    const prompts = scenePrompts.map((s) => s.prompt);

    return NextResponse.json({
      success: true,
      outline: scenes,
      prompts,
      scenePrompts,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
