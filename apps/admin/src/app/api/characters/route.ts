import { NextResponse } from "next/server";
import { prisma } from "@vx/db";

export async function GET() {
  try {
    const characters = await prisma.character.findMany({
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ data: characters });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
