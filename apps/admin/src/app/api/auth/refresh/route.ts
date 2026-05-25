import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    accessToken: "mock-access-token-refreshed",
    refreshToken: "mock-refresh-token-refreshed",
  });
}
