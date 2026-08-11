import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { getR2Config, createR2Client, uploadToR2 } from "@vx/server-core/r2";
import { normalizeTags } from "@vx/coloring/data/tags";

export async function GET() {
  try {
    const artStyles = await prisma.artStyle.findMany({
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ data: artStyles });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      description,
      referenceImageUrls,
      lineWork,
      composition,
      formAndShape,
      moodAndAtmosphere,
      patternAndTexture,
      technical,
      generationDirective,
      tags,
      sourceBookId,
    } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Create Postgres row with empty images initially
    const created = await prisma.artStyle.create({
      data: {
        name,
        description: description || "",
        referenceImages: [],
        thumbnailUrl: "",
        lineWork: lineWork || {},
        composition: composition || {},
        formAndShape: formAndShape || {},
        moodAndAtmosphere: moodAndAtmosphere || {},
        patternAndTexture: patternAndTexture || {},
        technical: technical || {},
        generationDirective: generationDirective || "",
        tags: normalizeTags(tags || []),
        sourceBookId: sourceBookId || null,
      },
    });

    // Upload reference images (max 3)
    const referenceImages: { url: string; label: string }[] = [];
    const labels = ["primary", "detail", "full-page"];

    if (referenceImageUrls && Array.isArray(referenceImageUrls)) {
      const r2Config = getR2Config();
      const r2Client = createR2Client(r2Config);
      const urls = referenceImageUrls.slice(0, 3);

      for (let i = 0; i < urls.length; i++) {
        const imgUrl = urls[i];
        let buffer: Buffer;

        if (imgUrl.startsWith("data:")) {
          const base64 = imgUrl.split(",")[1];
          buffer = Buffer.from(base64, "base64");
        } else {
          const res = await fetch(imgUrl);
          const arrayBuf = await res.arrayBuffer();
          buffer = Buffer.from(arrayBuf);
        }

        const key = `assets/art-styles/${created.id}/ref-${i}.png`;
        const { url } = await uploadToR2({
          client: r2Client,
          config: r2Config,
          key,
          body: buffer,
          contentType: "image/png",
        });

        referenceImages.push({ url, label: labels[i] || `ref-${i}` });
      }

      // Update row with uploaded images
      await prisma.artStyle.update({
        where: { id: created.id },
        data: {
          referenceImages,
          thumbnailUrl: referenceImages[0]?.url || "",
        },
      });
    }

    return NextResponse.json({
      success: true,
      id: created.id,
      referenceImages,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
