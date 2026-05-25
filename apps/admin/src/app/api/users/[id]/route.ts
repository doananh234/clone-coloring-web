import { NextRequest, NextResponse } from "next/server";
import { mockUsers } from "@/mocks/users";

let users = [...mockUsers];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = users.find((u) => u.id === id);
  if (!user) return NextResponse.json({ message: "Not found" }, { status: 404 });
  return NextResponse.json(user);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) return NextResponse.json({ message: "Not found" }, { status: 404 });
  const data = await req.json();
  users[index] = { ...users[index], ...data };
  return NextResponse.json(users[index]);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  users = users.filter((u) => u.id !== id);
  return new NextResponse(null, { status: 204 });
}
