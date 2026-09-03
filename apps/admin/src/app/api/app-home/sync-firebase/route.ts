import { NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { FieldValue } from "firebase-admin/firestore";
import { getSyncFirestore } from "@/lib/firebase-sync";
import type { AppHomeDoc } from "@vx/server-core/home";

export const dynamic = "force-dynamic";

/**
 * POST — push the local `app/home` config UP to the real (prod) Firestore
 * `app/home` document. Shapes the payload to the EXACT prod schema (only the
 * known keys) and writes with { merge: true } + a server `updatedAt`, so no
 * unexpected local keys leak into prod and existing fields are never dropped.
 *
 * Run POST /api/app-home/sync first to (re)build the local doc from tagged books.
 */
export async function POST() {
  try {
    const app = await prisma.app.findUnique({ where: { id: "home" } });
    if (!app) {
      return NextResponse.json(
        { error: "No local app/home doc — run POST /api/app-home/sync first." },
        { status: 404 },
      );
    }
    const d = (app.data as Partial<AppHomeDoc> | null) ?? {};

    // Whitelist to the exact Firestore app/home schema — never push stray keys.
    const payload: Record<string, unknown> = {
      newArrivalBooks: Array.isArray(d.newArrivalBooks) ? d.newArrivalBooks : [],
      trendingBooks: Array.isArray(d.trendingBooks) ? d.trendingBooks : [],
      categories: Array.isArray(d.categories) ? d.categories : [],
      // Additive local extension — safe (Firestore is schemaless; the app ignores
      // unknown fields). Omit entirely when empty to avoid writing a stray field.
      ...(Array.isArray(d.freeColoringPages) && d.freeColoringPages.length
        ? { freeColoringPages: d.freeColoringPages }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const { db, projectId } = getSyncFirestore();
    await db.collection("app").doc("home").set(payload, { merge: true });

    return NextResponse.json({
      success: true,
      projectId,
      pushed: {
        newArrivalBooks: (payload.newArrivalBooks as unknown[]).length,
        trendingBooks: (payload.trendingBooks as unknown[]).length,
        categories: (payload.categories as unknown[]).length,
        freeColoringPages: Array.isArray(d.freeColoringPages) ? d.freeColoringPages.length : 0,
      },
    });
  } catch (error) {
    console.error("[app-home/sync-firebase] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
