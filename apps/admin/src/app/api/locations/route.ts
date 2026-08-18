import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { listEntity } from "@/lib/list-query";

// List projection: drops heavy JSON (visualDescription, locationPrompt,
// atmosphere, props, data). The card only needs image + name + description + tags.
const LIST_SELECT = {
  id: true,
  name: true,
  description: true,
  tags: true,
  referenceImageUrl: true,
  sourceBookId: true,
  createdAt: true,
} as const;

export async function GET(req: NextRequest) {
  try {
    return await listEntity(
      req,
      {
        findMany: (a) => prisma.location.findMany(a),
        count: (a) => prisma.location.count(a),
      },
      { select: LIST_SELECT, searchFields: ["name", "description"] },
    );
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
