import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getR2Config, createR2Client, uploadToR2 } from "@/lib/r2";

export async function GET() {
  try {
    const snap = await adminDb.collection("artStyles").orderBy("name").get();
    const artStyles = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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

    // Create Firestore doc with empty images initially
    const docRef = await adminDb.collection("artStyles").add({
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
      tags: tags || [],
      sourceBookId: sourceBookId || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
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

        const key = `assets/art-styles/${docRef.id}/ref-${i}.png`;
        const { url } = await uploadToR2({
          client: r2Client,
          config: r2Config,
          key,
          body: buffer,
          contentType: "image/png",
        });

        referenceImages.push({ url, label: labels[i] || `ref-${i}` });
      }

      // Update doc with uploaded images
      await adminDb
        .collection("artStyles")
        .doc(docRef.id)
        .update({
          referenceImages,
          thumbnailUrl: referenceImages[0]?.url || "",
        });
    }

    return NextResponse.json({
      success: true,
      id: docRef.id,
      referenceImages,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
