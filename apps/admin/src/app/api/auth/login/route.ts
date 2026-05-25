import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    accessToken: "mock-access-token",
    refreshToken: "mock-refresh-token",
  });
}
