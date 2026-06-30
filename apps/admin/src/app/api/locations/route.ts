import { NextResponse } from "next/server";
import { prisma } from "@vx/db";

export async function GET() {
  try {
    const locations = await prisma.location.findMany({
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ data: locations });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
