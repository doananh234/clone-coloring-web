import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { listEntity } from "@/lib/list-query";

// List projection: drops heavy JSON (visualDna, characterPrompt, data). The
// card only needs the image + name + role/type + tags.
const LIST_SELECT = {
  id: true,
  name: true,
  type: true,
  role: true,
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
        findMany: (a) => prisma.character.findMany(a),
        count: (a) => prisma.character.count(a),
      },
      { select: LIST_SELECT, searchFields: ["name"] },
    );
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
