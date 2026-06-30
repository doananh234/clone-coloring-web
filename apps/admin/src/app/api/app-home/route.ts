import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";

export async function GET() {
  try {
    const app = await prisma.app.findUnique({ where: { id: "home" } });
    return NextResponse.json(app?.data ?? {});
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const app = await prisma.app.upsert({
      where: { id: "home" },
      create: { id: "home", data: body },
      update: { data: body },
    });
    return NextResponse.json(app.data);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
